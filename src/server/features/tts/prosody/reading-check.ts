import { z } from "zod";
import { splitKanaMoras } from "@/_schemas";
import type { ServerEnv } from "@/server/core/env";
import { requestOpenRouterJson } from "@/server/core/openrouter";
import { LLM_READING_CHECK_PROFILE } from "./profiles";

/** One kana word: `index` counts words across the whole kana, `reading` has no accent marks. */
export type KanaWord = { index: number; surface: string; reading: string };

export type ReadingCorrection = { index: number; surface: string; heard: string; correct: string };

const KANA_WORD = /[^/、？！|]+/gu;

const SYSTEM = `You check how Japanese utterances were actually pronounced in recordings.
Input: items, each with id, text, and words = an analyzer's split of the text, each with index, surface and its reading in katakana.
After the items, one recording per item follows, each introduced by "recording <id>". Judge each item only by its own recording.
For each word decide two readings:
- heard: the reading as spoken in the recording.
- correct: the reading a native speaker would use for this word in this context.
Report only the words where heard differs from the analyzer's reading, or heard differs from correct.
- Readings are katakana as pronounced. Particle は→ワ, へ→エ, を→ヲ. Long vowels as ー.
- Judge the sounds (moras) only. Ignore pitch accent, pauses, speed and emotion.
- Same sounds written differently (オオ vs オー) are not a difference.
- Return every item, with an empty corrections list when everything matches.`;

const correctionSchema = z.object({
  index: z.number().int(),
  surface: z.string(),
  heard: z.string(),
  correct: z.string(),
});

const outputSchema = z.object({
  items: z.array(z.object({ id: z.string(), corrections: z.array(correctionSchema) })),
});

const outputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "corrections"],
        properties: {
          id: { type: "string" },
          corrections: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["index", "surface", "heard", "correct"],
              properties: {
                index: { type: "integer" },
                surface: { type: "string" },
                heard: { type: "string" },
                correct: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;

/** One utterance to check: its text, the analyzer's words, and the reference recording. */
export type ReadingCheckItem = { id: string; text: string; words: KanaWord[]; wav: Buffer };

function splitWord(word: string) {
  const colon = word.indexOf(":");
  return colon < 0
    ? { surface: undefined, reading: word }
    : { surface: word.slice(0, colon), reading: word.slice(colon + 1) };
}

/** Katakana, no accent marks: the form readings are compared and written in. */
export function normalizeReading(reading: string) {
  return splitKanaMoras(reading.replaceAll("'", "")).join("");
}

export function wordsOf(kana: string): KanaWord[] {
  return [...kana.matchAll(KANA_WORD)].map(([word], index) => {
    const { surface, reading } = splitWord(word);
    const plain = reading.replaceAll("'", "");
    return { index, surface: surface ?? plain, reading: plain };
  });
}

export function sameSound(a: string, b: string) {
  return normalizeReading(a).replaceAll("ー", "") === normalizeReading(b).replaceAll("ー", "");
}

/** Spells the given words in katakana inside the text; words are matched left to right. */
export function respell(text: string, words: KanaWord[], readings: Map<number, string>) {
  let out = "";
  let cursor = 0;
  for (const word of words) {
    const at = text.indexOf(word.surface, cursor);
    if (at < 0) {
      continue;
    }
    const reading = readings.get(word.index);
    out += text.slice(cursor, at) + (reading ? normalizeReading(reading) : word.surface);
    cursor = at + word.surface.length;
  }
  return out + text.slice(cursor);
}

/** Puts readings back into the kana, keeping its phrases; a changed word keeps its nucleus offset. */
export function applyReadings(kana: string, readings: Map<number, string>) {
  let index = -1;
  return kana.replace(KANA_WORD, (word) => {
    index += 1;
    const next = readings.get(index);
    if (!next) {
      return word;
    }
    const { surface, reading } = splitWord(word);
    const moras = splitKanaMoras(normalizeReading(next));
    const quote = reading.indexOf("'");
    if (quote >= 0) {
      moras.splice(Math.min(splitKanaMoras(reading.slice(0, quote)).length, moras.length), 0, "'");
    }
    return surface === undefined ? moras.join("") : `${surface}:${moras.join("")}`;
  });
}

/**
 * Words whose reading differs from the base kana (an analyzer's), matched by surface in order.
 * The values are the new readings.
 */
export function changedReadings(words: KanaWord[], baseWords: KanaWord[]) {
  const changed = new Map<number, string>();
  let cursor = 0;
  for (const word of words) {
    const at = baseWords.findIndex((base, i) => i >= cursor && base.surface === word.surface);
    if (at >= 0) {
      cursor = at + 1;
    }
    if (at < 0 || !sameSound(baseWords[at]!.reading, word.reading)) {
      changed.set(word.index, word.reading);
    }
  }
  return changed;
}

/**
 * Asks the LLM, for a chunk of utterances in one request, which words each recording reads
 * differently from the analyzer, and how they should be read.
 *
 * Ids are sent as "1", "2"…, like the LLM G2P. The result has an entry only for the items the
 * LLM returned; a missing item counts as unchecked.
 */
export async function checkReadings(
  serverEnv: ServerEnv,
  items: readonly ReadingCheckItem[],
): Promise<Map<string, ReadingCorrection[]>> {
  const aliases = items.map((_, index) => String(index + 1));
  const result = await requestOpenRouterJson(serverEnv, {
    profile: LLM_READING_CHECK_PROFILE,
    system: SYSTEM,
    user: [
      {
        type: "text",
        text: JSON.stringify({
          items: items.map((item, index) => ({
            id: aliases[index],
            text: item.text,
            words: item.words,
          })),
        }),
      },
      ...items.flatMap((item, index) => [
        { type: "text" as const, text: `recording ${aliases[index]}` },
        {
          type: "input_audio" as const,
          input_audio: { data: item.wav.toString("base64"), format: "wav" as const },
        },
      ]),
    ],
    schemaName: "readings",
    jsonSchema: outputJsonSchema,
    output: outputSchema,
  });

  const byAlias = new Map(items.map((item, index) => [aliases[index]!, item]));
  const corrections = new Map<string, ReadingCorrection[]>();
  for (const entry of result.output.items) {
    const item = byAlias.get(entry.id);
    if (!item || corrections.has(item.id)) {
      continue;
    }
    const indexes = new Set(item.words.map((word) => word.index));
    corrections.set(
      item.id,
      entry.corrections.filter((correction) => indexes.has(correction.index)),
    );
  }
  return corrections;
}
