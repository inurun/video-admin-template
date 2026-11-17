import type { G2pItem, ProsodyExtract } from "@/_schemas";
import type { AnalyzedItem, DictionaryWord } from "@/server/features/haqumei-api/analyze";
import type { ServerEnv } from "@/server/core/env";
import { runPool } from "@/server/_shared/run-pool";
import { analyzeTextsWithDictionary } from "@/server/features/haqumei-api/analyze";
import { extractProsody } from "@/server/features/haqumei-api/prosody";
import { validateG2pItem } from "@/server/features/haqumei-api/validate";
import { chunkItems } from "@/server/features/tts/llm-g2p-profile";
import {
  readCachedProsody,
  readCachedProsodySource,
  writeCachedProsody,
  writeCachedProsodySource,
} from "./cache";
import { LLM_READING_CHECK_PROFILE } from "./profiles";
import {
  alignWords,
  applyReadings,
  changedReadings,
  checkReadings,
  normalizeReading,
  respell,
  sameSound,
  wordsOf,
  type KanaWord,
  type ReadingCheckItem,
  type ReadingCorrection,
} from "./reading-check";
import { synthesizeProsodySource, type ProsodySourceContext } from "./source";
import type { ProsodySource } from "./source-config";

/** Reference TTS and extract calls in flight at once. */
const PROSODY_CONCURRENCY = 3;

/** The kana to save, and the reference prosody when every step went through. */
export type ProsodyAnalysis = { g2p: G2pItem; prosody?: ProsodyExtract };

/**
 * `g2p` is the saved (possibly edited) kana; without it the kana comes from the analyzer.
 * `source` is the character's reference TTS; `context` the neighboring utterances it hears.
 */
export type ProsodyTarget = {
  readText: string;
  g2p?: G2pItem;
  source: ProsodySource;
  context?: ProsodySourceContext;
};

/**
 * An analyzer kana whose reference audio still has to pass the reading check. `dictionary` holds
 * the readings of the words taken from the user dictionary: the reference TTS gets them in
 * katakana. The check cannot change the `fixed` ones; a contextual word's reading was only
 * chosen by the analyzer, so the check may correct it like any other word.
 */
type Unchecked = {
  id: string;
  analyzed: G2pItem;
  source: ProsodySource;
  context?: ProsodySourceContext;
  words: KanaWord[];
  dictionary: Map<number, string>;
  fixed: Set<number>;
  wav: Buffer;
};

/** Corrections per item id; an item without an entry was not checked. */
type CheckResults = Map<string, ReadingCorrection[]>;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function warn(text: string, reason: string) {
  console.warn(`[prosody] ${text}: ${reason}; synthesizing without prosody`);
}

function describe(corrections: ReadingCorrection[]) {
  return corrections.map((c) => `${c.surface} heard ${c.heard}, correct ${c.correct}`).join("; ");
}

const misreadOf = (corrections: ReadingCorrection[]) =>
  corrections.filter((c) => !sameSound(c.heard, c.correct));

/** The dictionary words' readings, by word index. */
const dictionaryReadings = (words: KanaWord[], dictionaryWords: DictionaryWord[]) => {
  const wanted = new Set(dictionaryWords.map((word) => word.index));
  return new Map(words.filter((w) => wanted.has(w.index)).map((w) => [w.index, w.reading]));
};

/** The text the reference TTS reads: the dictionary words (and `extra`) in katakana. */
const referenceText = (item: Omit<Unchecked, "wav">, extra = new Map<number, string>()) =>
  respell(item.analyzed.text, item.words, new Map([...item.dictionary, ...extra]));

/** The fixed dictionary words, by word index. */
const fixedWords = (dictionaryWords: DictionaryWord[]) =>
  new Set(dictionaryWords.filter((word) => word.kind === "fixed").map((word) => word.index));

/** Leaves the fixed dictionary words out of the check's corrections. */
const ownCorrections = (item: Pick<Unchecked, "fixed">, corrections: ReadingCorrection[]) =>
  corrections.filter((c) => !item.fixed.has(c.index));

/** Readings to write into the kana: what was heard, or the correct one where the audio misread. */
function readingsToApply(words: KanaWord[], corrections: ReadingCorrection[]) {
  const byIndex = new Map(words.map((word) => [word.index, word]));
  const readings = new Map<number, string>();
  for (const correction of corrections) {
    const reading = sameSound(correction.heard, correction.correct)
      ? correction.heard
      : correction.correct;
    const word = byIndex.get(correction.index);
    if (word && normalizeReading(reading) !== word.reading) {
      readings.set(correction.index, reading);
    }
  }
  return readings;
}

/** Reference audio for each text; an item whose TTS fails is left out (logged). */
async function synthesizeSources(
  serverEnv: ServerEnv,
  items: readonly {
    id: string;
    text: string;
    source: ProsodySource;
    context?: ProsodySourceContext;
  }[],
) {
  const wavs = new Map<string, Buffer>();
  await runPool(items, PROSODY_CONCURRENCY, async (item) => {
    try {
      wavs.set(
        item.id,
        await synthesizeProsodySource(serverEnv, item.text, item.source, item.context),
      );
    } catch (error) {
      warn(item.text, `reference reading failed: ${errorMessage(error)}`);
    }
  });
  return wavs;
}

/** Reading checks `chunkSize` items per request; a failed chunk leaves its items unchecked. */
async function checkInChunks(
  serverEnv: ServerEnv,
  items: readonly ReadingCheckItem[],
): Promise<CheckResults> {
  const results: CheckResults = new Map();
  const chunks = chunkItems(items, LLM_READING_CHECK_PROFILE.chunkSize);
  await runPool(chunks, LLM_READING_CHECK_PROFILE.concurrency, async (chunk) => {
    try {
      const checked = await checkReadings(serverEnv, chunk);
      for (const item of chunk) {
        const corrections = checked.get(item.id);
        if (corrections) {
          results.set(item.id, corrections);
        } else {
          warn(item.text, "reading check returned readings that do not match the kana's words");
        }
      }
    } catch (error) {
      for (const item of chunk) {
        warn(item.text, `reading check failed: ${errorMessage(error)}`);
      }
    }
  });
  return results;
}

const toCheckItem = (item: Unchecked): ReadingCheckItem => ({
  id: item.id,
  text: item.analyzed.text,
  kana: item.analyzed.kana,
  wav: item.wav,
});

/**
 * Checks every reference recording in chunks. A recording that misread a word is made again
 * with that word in katakana, and those are checked once more (again in chunks).
 */
async function checkReferences(serverEnv: ServerEnv, items: readonly Unchecked[]) {
  const checkOwn = async (checking: readonly Unchecked[]) => {
    const results = await checkInChunks(serverEnv, checking.map(toCheckItem));
    for (const item of checking) {
      const corrections = results.get(item.id);
      if (corrections) {
        results.set(item.id, ownCorrections(item, corrections));
      }
    }
    return results;
  };
  const first = await checkOwn(items);
  const retries = items.flatMap((item) => {
    const misread = misreadOf(first.get(item.id) ?? []);
    return misread.length > 0
      ? [{ item, text: referenceText(item, new Map(misread.map((c) => [c.index, c.correct]))) }]
      : [];
  });

  const final = new Map<string, { wav: Buffer; corrections: ReadingCorrection[] }>();
  for (const item of items) {
    const corrections = first.get(item.id);
    if (corrections && misreadOf(corrections).length === 0) {
      final.set(item.id, { wav: item.wav, corrections });
    }
  }
  if (retries.length === 0) {
    return final;
  }

  const wavs = await synthesizeSources(
    serverEnv,
    retries.map(({ item, text }) => ({
      id: item.id,
      text,
      source: item.source,
      context: item.context,
    })),
  );
  const second = await checkOwn(
    retries.flatMap(({ item }) => {
      const wav = wavs.get(item.id);
      return wav ? [{ ...item, wav }] : [];
    }),
  );
  for (const { item } of retries) {
    const wav = wavs.get(item.id);
    const corrections = second.get(item.id);
    if (wav && corrections) {
      final.set(item.id, { wav, corrections });
    }
  }
  return final;
}

async function extractFor(
  serverEnv: ServerEnv,
  projectPath: string,
  g2p: G2pItem,
  source: ProsodySource,
  wav: Buffer,
): Promise<ProsodyAnalysis> {
  try {
    const prosody = await extractProsody(serverEnv, g2p, wav);
    await writeCachedProsody(projectPath, g2p, source, prosody);
    return { g2p, prosody };
  } catch (error) {
    warn(g2p.text, `extract failed: ${errorMessage(error)}`);
    return { g2p };
  }
}

/** Settles the kana from the checked readings, then extracts the prosody. */
async function settleChecked(
  serverEnv: ServerEnv,
  projectPath: string,
  item: Unchecked,
  checked: { wav: Buffer; corrections: ReadingCorrection[] } | undefined,
): Promise<ProsodyAnalysis> {
  const { analyzed } = item;
  if (!checked) {
    return { g2p: analyzed };
  }

  const kana = applyReadings(analyzed.kana, readingsToApply(item.words, checked.corrections));
  let g2p = analyzed;
  if (kana !== analyzed.kana) {
    try {
      g2p = await validateG2pItem(serverEnv, { text: analyzed.text, kana });
    } catch (error) {
      warn(analyzed.text, `corrected kana ${kana} is invalid: ${errorMessage(error)}`);
      return { g2p: analyzed };
    }
  }
  const misread = misreadOf(checked.corrections);
  if (misread.length > 0) {
    warn(analyzed.text, `reference still misreads ${describe(misread)}`);
    return { g2p };
  }

  await writeCachedProsodySource(projectPath, g2p, item.source, checked.wav);
  return extractFor(serverEnv, projectPath, g2p, item.source, checked.wav);
}

/**
 * An edited kana: words read differently from the analyzer, and the analyzer's dictionary
 * words, are spelled in katakana; no check.
 */
async function fromSavedKana(
  serverEnv: ServerEnv,
  projectPath: string,
  analyzed: AnalyzedItem,
  g2p: G2pItem,
  source: ProsodySource,
  context: ProsodySourceContext | undefined,
): Promise<ProsodyAnalysis> {
  const cached = await readCachedProsody(projectPath, g2p, source);
  if (cached) {
    return { g2p, prosody: cached };
  }

  let wav = await readCachedProsodySource(projectPath, g2p, source);
  if (!wav) {
    const words = wordsOf(g2p.kana);
    const baseWords = wordsOf(analyzed.g2p.kana);
    const dictionary = new Set(analyzed.dictionaryWords.map((word) => word.index));
    const changed = changedReadings(words, baseWords);
    alignWords(words, baseWords).forEach((base, i) => {
      if (base && dictionary.has(base.index)) {
        changed.set(words[i]!.index, words[i]!.reading);
      }
    });
    try {
      wav = await synthesizeProsodySource(
        serverEnv,
        respell(g2p.text, words, changed),
        source,
        context,
      );
    } catch (error) {
      warn(g2p.text, `reference reading failed: ${errorMessage(error)}`);
      return { g2p };
    }
    await writeCachedProsodySource(projectPath, g2p, source, wav);
  }
  return extractFor(serverEnv, projectPath, g2p, source, wav);
}

/**
 * Settles the kana and reference prosody for each target. Analyze errors fail the batch;
 * any later failure only drops the prosody (logged).
 *
 * Analyzer kana go through the reading check together: their reference audio is made first,
 * then checked `chunkSize` utterances per LLM request.
 *
 * `fresh` ignores the saved kana and the cached reference audio: every target is analyzed,
 * read and checked again (the caches are overwritten).
 */
export async function analyzeProsody(
  serverEnv: ServerEnv,
  projectPath: string,
  targets: readonly ProsodyTarget[],
  { fresh = false }: { fresh?: boolean } = {},
): Promise<ProsodyAnalysis[]> {
  const analyzed = await analyzeTextsWithDictionary(
    serverEnv,
    targets.map((target) => target.readText),
  );
  const items = targets.map((target, index) => {
    const base = analyzed[index];
    if (!base) {
      throw new Error(`haqumei-api analyze returned no item for ${target.readText}`);
    }
    return { id: String(index), target, base };
  });

  const results = new Map<string, ProsodyAnalysis>();
  const toCheck: Omit<Unchecked, "wav">[] = [];
  await runPool(items, PROSODY_CONCURRENCY, async ({ id, target, base }) => {
    const { source, context } = target;
    if (target.g2p && !fresh) {
      results.set(
        id,
        await fromSavedKana(serverEnv, projectPath, base, target.g2p, source, context),
      );
      return;
    }
    // A cached source for these readings already passed the check.
    const cachedSource = fresh
      ? undefined
      : await readCachedProsodySource(projectPath, base.g2p, source);
    if (cachedSource) {
      results.set(id, await extractFor(serverEnv, projectPath, base.g2p, source, cachedSource));
      return;
    }
    const words = wordsOf(base.g2p.kana);
    toCheck.push({
      id,
      analyzed: base.g2p,
      source,
      context,
      words,
      dictionary: dictionaryReadings(words, base.dictionaryWords),
      fixed: fixedWords(base.dictionaryWords),
    });
  });

  if (toCheck.length > 0) {
    const wavs = await synthesizeSources(
      serverEnv,
      toCheck.map((item) => ({ ...item, text: referenceText(item) })),
    );
    const unchecked: Unchecked[] = toCheck.flatMap((item) => {
      const wav = wavs.get(item.id);
      if (!wav) {
        results.set(item.id, { g2p: item.analyzed });
        return [];
      }
      return [{ ...item, wav }];
    });
    const checked = await checkReferences(serverEnv, unchecked);
    await runPool(unchecked, PROSODY_CONCURRENCY, async (item) => {
      results.set(item.id, await settleChecked(serverEnv, projectPath, item, checked.get(item.id)));
    });
  }

  return items.map(({ id, base }) => results.get(id) ?? { g2p: base.g2p });
}
