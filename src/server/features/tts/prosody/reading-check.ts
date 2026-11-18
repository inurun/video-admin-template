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
Each utterance comes as "#<id>", its text, and its kana: an analyzer's reading of the text as words "surface:reading" separated by spaces (punctuation stands alone), followed by its recording. Judge each utterance only by its own recording.
For each word decide two readings:
- heard: the reading as spoken in the recording.
- correct: the reading a native speaker would use for this word in this context.
Return every utterance. When a word's heard differs from its kana reading, or heard differs from correct, write heard and correct as whole kana lines: the same words in the same order with the same surfaces and punctuation, only the readings changed. When everything matches, set both to null.
- Readings are katakana as pronounced. Particle は→ワ, へ→エ, を→ヲ. Long vowels as ー.
- Judge the sounds (moras) only. Ignore pitch accent, pauses, speed and emotion.
- Same sounds written differently (オオ vs オー) are not a difference, but a missing or extra long vowel is (オーケ vs オーケー).
`;

const outputSchema = z.object({
  items: z.array(
    z.object({ id: z.string(), heard: z.string().nullable(), correct: z.string().nullable() }),
  ),
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
        required: ["id", "heard", "correct"],
        properties: {
          id: { type: "string" },
          heard: { type: ["string", "null"] },
          correct: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

/** One utterance to check: its text, the analyzer's kana, and the reference recording. */
export type ReadingCheckItem = { id: string; text: string; kana: string; wav: Buffer };

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

const VOWEL_ROWS = [
  ["ア", "アカガサザタダナハバパマヤラワァャヮ"],
  ["イ", "イキギシジチヂニヒビピミリィ"],
  ["ウ", "ウクグスズツヅヌフブプムユルゥュヴ"],
  ["エ", "エケゲセゼテデネヘベペメレェ"],
  ["オ", "オコゴソゾトドノホボポモヨロヲォョ"],
] as const;

function vowelOf(mora: string) {
  const last = mora.at(-1) ?? "";
  return VOWEL_ROWS.find(([, row]) => row.includes(last))?.[0];
}

/** Moras with each ー spelled as the vowel before it, so length counts but spelling does not. */
function soundMoras(reading: string) {
  const moras = splitKanaMoras(normalizeReading(reading));
  return moras.map((mora, index) =>
    mora === "ー" && index > 0 ? (vowelOf(moras[index - 1]!) ?? mora) : mora,
  );
}

/**
 * Same moras when read aloud: オー and オオ match, but オーケ and オーケー do not (the reference
 * is aligned mora by mora, so a missing long vowel matters).
 */
export function sameSound(a: string, b: string) {
  return soundMoras(a).join("") === soundMoras(b).join("");
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
/** For each word, the next base word with the same surface, in order; `undefined` when none. */
export function alignWords(words: KanaWord[], baseWords: KanaWord[]) {
  let cursor = 0;
  return words.map((word) => {
    const at = baseWords.findIndex((base, i) => i >= cursor && base.surface === word.surface);
    if (at < 0) {
      return undefined;
    }
    cursor = at + 1;
    return baseWords[at];
  });
}

export function changedReadings(words: KanaWord[], baseWords: KanaWord[]) {
  const aligned = alignWords(words, baseWords);
  const changed = new Map<number, string>();
  words.forEach((word, i) => {
    const base = aligned[i];
    if (!base || !sameSound(base.reading, word.reading)) {
      changed.set(word.index, word.reading);
    }
  });
  return changed;
}

const PUNCTUATION = /([、？！])/u;

/** The kana as the check reads and writes it: words "surface:reading" and punctuation, spaced. */
export function kanaLine(kana: string) {
  return kana
    .replaceAll("'", "")
    .split(/[/|]|([、？！])/u)
    .filter(Boolean)
    .join(" ");
}

/** The words of a kana line, punctuation left out. */
function lineWords(line: string) {
  return line
    .split(/\s+/u)
    .filter((token) => token && !PUNCTUATION.test(token))
    .map((token) => {
      const { surface, reading } = splitWord(token);
      return { surface: surface ?? reading, reading };
    });
}

/**
 * The line's reading of each analyzer word, matched by surface. The line may split or join
 * words differently: a line word spanning several analyzer words must read the same as they
 * do (then each keeps its own reading). `undefined` when the surfaces differ, or a joined span
 * reads differently (the difference cannot be put on one word).
 */
function readingsByWord(words: KanaWord[], line: string): string[] | undefined {
  const tokens = lineWords(line);
  const readings: string[] = [];
  let w = 0;
  let t = 0;
  while (w < words.length || t < tokens.length) {
    const group = { words: [] as KanaWord[], tokens: [] as typeof tokens };
    let wordSurface = "";
    let tokenSurface = "";
    do {
      if (wordSurface.length <= tokenSurface.length && w < words.length) {
        group.words.push(words[w]!);
        wordSurface += words[w++]!.surface;
      } else if (t < tokens.length) {
        group.tokens.push(tokens[t]!);
        tokenSurface += tokens[t++]!.surface;
      } else {
        return undefined;
      }
    } while (wordSurface !== tokenSurface);
    const reading = group.tokens.map((token) => token.reading).join("");
    if (group.words.length === 1) {
      readings.push(reading);
    } else if (sameSound(reading, group.words.map((word) => word.reading).join(""))) {
      readings.push(...group.words.map((word) => word.reading));
    } else {
      return undefined;
    }
  }
  return readings;
}

/**
 * Corrections from the heard and correct lines, matched to the analyzer's words by surface;
 * `undefined` when a line cannot be matched.
 */
export function correctionsFromLines(
  words: KanaWord[],
  heardLine: string,
  correctLine: string,
): ReadingCorrection[] | undefined {
  const heard = readingsByWord(words, heardLine);
  const correct = readingsByWord(words, correctLine);
  if (!heard || !correct) {
    return undefined;
  }
  return words.flatMap((word, i) => {
    const h = heard[i]!;
    const c = correct[i]!;
    return normalizeReading(h) !== word.reading || !sameSound(h, c)
      ? [{ index: word.index, surface: word.surface, heard: h, correct: c }]
      : [];
  });
}

/**
 * Asks the LLM, for a chunk of utterances in one request, which words each recording reads
 * differently from the analyzer, and how they should be read.
 *
 * Ids are sent as "1", "2"…, like the LLM G2P. The LLM returns every utterance, with null lines
 * when nothing differs; an utterance it leaves out counts as matching too. An utterance whose
 * returned lines do not have the analyzer's words is left out of the result (unchecked).
 */
export async function checkReadings(
  serverEnv: ServerEnv,
  items: readonly ReadingCheckItem[],
): Promise<Map<string, ReadingCorrection[]>> {
  const aliases = items.map((_, index) => String(index + 1));
  const result = await requestOpenRouterJson(serverEnv, {
    profile: LLM_READING_CHECK_PROFILE,
    system: SYSTEM,
    user: items.flatMap((item, index) => [
      {
        type: "text" as const,
        text: `#${aliases[index]}\ntext: ${item.text}\nkana: ${kanaLine(item.kana)}`,
      },
      {
        type: "input_audio" as const,
        input_audio: { data: item.wav.toString("base64"), format: "wav" as const },
      },
    ]),
    schemaName: "readings",
    jsonSchema: outputJsonSchema,
    output: outputSchema,
  });

  const corrections = new Map<string, ReadingCorrection[]>(items.map((item) => [item.id, []]));
  const byAlias = new Map(items.map((item, index) => [aliases[index]!, item]));
  const seen = new Set<string>();
  for (const entry of result.output.items) {
    const item = byAlias.get(entry.id);
    if (!item || seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    if (entry.heard === null && entry.correct === null) {
      continue;
    }
    const words = wordsOf(item.kana);
    const found = correctionsFromLines(
      words,
      entry.heard ?? entry.correct ?? "",
      entry.correct ?? entry.heard ?? "",
    );
    if (found) {
      corrections.set(item.id, found);
    } else {
      corrections.delete(item.id);
    }
  }
  return corrections;
}
