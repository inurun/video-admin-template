import { z } from "zod";
import { splitKanaMoras } from "@/_schemas";
import type { ServerEnv } from "@/server/core/env";
import { requestOpenRouterJson } from "@/server/core/openrouter";
import { LLM_READING_CHECK_PROFILE } from "./profiles";

/** One kana word: `index` counts words across the whole kana, `reading` has no accent marks. */
export type KanaWord = { index: number; surface: string; reading: string };

export type ReadingCorrection = { index: number; surface: string; heard: string; correct: string };

const KANA_WORD = /[^/、？！|]+/gu;

const SYSTEM = `You check how a Japanese utterance was actually pronounced in a recording.
Input: the text, and words = an analyzer's split of the text, each with index, surface and its reading in katakana.
For each word decide two readings:
- heard: the reading as spoken in the recording.
- correct: the reading a native speaker would use for this word in this context.
Report only the words where heard differs from the analyzer's reading, or heard differs from correct.
- Readings are katakana as pronounced. Particle は→ワ, へ→エ, を→ヲ. Long vowels as ー.
- Judge the sounds (moras) only. Ignore pitch accent, pauses, speed and emotion.
- Same sounds written differently (オオ vs オー) are not a difference.
- Return an empty list when everything matches.`;

const correctionsSchema = z.object({
  corrections: z.array(
    z.object({
      index: z.number().int(),
      surface: z.string(),
      heard: z.string(),
      correct: z.string(),
    }),
  ),
});

const correctionsJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["corrections"],
  properties: {
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
} as const;

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

/** Asks the LLM which words the recording reads differently from the analyzer, and how they should be read. */
export async function checkReadings(
  serverEnv: ServerEnv,
  input: { text: string; words: KanaWord[]; wav: Buffer },
): Promise<ReadingCorrection[]> {
  const result = await requestOpenRouterJson(serverEnv, {
    profile: LLM_READING_CHECK_PROFILE,
    system: SYSTEM,
    user: [
      { type: "text", text: JSON.stringify({ text: input.text, words: input.words }) },
      { type: "input_audio", input_audio: { data: input.wav.toString("base64"), format: "wav" } },
    ],
    schemaName: "readings",
    jsonSchema: correctionsJsonSchema,
    output: correctionsSchema,
  });
  const indexes = new Set(input.words.map((word) => word.index));
  return result.output.corrections.filter((correction) => indexes.has(correction.index));
}
