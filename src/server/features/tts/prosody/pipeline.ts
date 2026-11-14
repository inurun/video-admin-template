import type { G2pItem, ProsodyExtract } from "@/_schemas";
import type { ServerEnv } from "@/server/core/env";
import { runPool } from "@/server/_shared/run-pool";
import { analyzeTexts } from "@/server/features/haqumei-api/analyze";
import { extractProsody } from "@/server/features/haqumei-api/prosody";
import { validateG2pItem } from "@/server/features/haqumei-api/validate";
import {
  readCachedProsody,
  readCachedProsodySource,
  writeCachedProsody,
  writeCachedProsodySource,
} from "./cache";
import {
  applyReadings,
  changedReadings,
  checkReadings,
  normalizeReading,
  respell,
  sameSound,
  wordsOf,
  type KanaWord,
  type ReadingCorrection,
} from "./reading-check";
import { synthesizeProsodySource } from "./source";

/** Reference TTS and LLM calls in flight at once. */
const PROSODY_CONCURRENCY = 3;

/** The kana to save, and the reference prosody when every step went through. */
export type ProsodyAnalysis = { g2p: G2pItem; prosody?: ProsodyExtract };

/** `g2p` is the saved (possibly edited) kana; without it the kana comes from the analyzer. */
export type ProsodyTarget = { readText: string; g2p?: G2pItem };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function warn(text: string, reason: string) {
  console.warn(`[prosody] ${text}: ${reason}; synthesizing without prosody`);
}

function describe(corrections: ReadingCorrection[]) {
  return corrections.map((c) => `${c.surface} heard ${c.heard}, correct ${c.correct}`).join("; ");
}

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

/**
 * Reference audio checked by the LLM. A misread word is spelled in katakana and the audio is
 * made once more.
 */
async function readWithCheck(serverEnv: ServerEnv, analyzed: G2pItem) {
  const text = analyzed.text;
  const words = wordsOf(analyzed.kana);
  let wav = await synthesizeProsodySource(serverEnv, text);
  let corrections = await checkReadings(serverEnv, { text, words, wav });
  const misread = corrections.filter((c) => !sameSound(c.heard, c.correct));
  if (misread.length > 0) {
    const respelled = respell(text, words, new Map(misread.map((c) => [c.index, c.correct])));
    wav = await synthesizeProsodySource(serverEnv, respelled);
    corrections = await checkReadings(serverEnv, { text, words, wav });
  }
  return {
    wav,
    kana: applyReadings(analyzed.kana, readingsToApply(words, corrections)),
    misread: corrections.filter((c) => !sameSound(c.heard, c.correct)),
  };
}

async function extractFor(
  serverEnv: ServerEnv,
  projectPath: string,
  g2p: G2pItem,
  wav: Buffer,
): Promise<ProsodyAnalysis> {
  try {
    const prosody = await extractProsody(serverEnv, g2p, wav);
    await writeCachedProsody(projectPath, g2p, prosody);
    return { g2p, prosody };
  } catch (error) {
    warn(g2p.text, `extract failed: ${errorMessage(error)}`);
    return { g2p };
  }
}

async function fromAnalyzer(
  serverEnv: ServerEnv,
  projectPath: string,
  analyzed: G2pItem,
): Promise<ProsodyAnalysis> {
  // A cached source for these readings already passed the check.
  const cachedSource = await readCachedProsodySource(projectPath, analyzed);
  if (cachedSource) {
    return extractFor(serverEnv, projectPath, analyzed, cachedSource);
  }

  let reading: Awaited<ReturnType<typeof readWithCheck>>;
  try {
    reading = await readWithCheck(serverEnv, analyzed);
  } catch (error) {
    warn(analyzed.text, `reference reading failed: ${errorMessage(error)}`);
    return { g2p: analyzed };
  }

  let g2p = analyzed;
  if (reading.kana !== analyzed.kana) {
    try {
      g2p = await validateG2pItem(serverEnv, { text: analyzed.text, kana: reading.kana });
    } catch (error) {
      warn(analyzed.text, `corrected kana ${reading.kana} is invalid: ${errorMessage(error)}`);
      return { g2p: analyzed };
    }
  }
  if (reading.misread.length > 0) {
    warn(analyzed.text, `reference still misreads ${describe(reading.misread)}`);
    return { g2p };
  }

  await writeCachedProsodySource(projectPath, g2p, reading.wav);
  return extractFor(serverEnv, projectPath, g2p, reading.wav);
}

/** An edited kana: words read differently from the analyzer are spelled in katakana, no check. */
async function fromSavedKana(
  serverEnv: ServerEnv,
  projectPath: string,
  analyzed: G2pItem,
  g2p: G2pItem,
): Promise<ProsodyAnalysis> {
  const cached = await readCachedProsody(projectPath, g2p);
  if (cached) {
    return { g2p, prosody: cached };
  }

  let wav = await readCachedProsodySource(projectPath, g2p);
  if (!wav) {
    const words = wordsOf(g2p.kana);
    const changed = changedReadings(words, wordsOf(analyzed.kana));
    try {
      wav = await synthesizeProsodySource(serverEnv, respell(g2p.text, words, changed));
    } catch (error) {
      warn(g2p.text, `reference reading failed: ${errorMessage(error)}`);
      return { g2p };
    }
    await writeCachedProsodySource(projectPath, g2p, wav);
  }
  return extractFor(serverEnv, projectPath, g2p, wav);
}

/**
 * Settles the kana and reference prosody for each target. Analyze errors fail the batch;
 * any later failure only drops the prosody (logged).
 */
export async function analyzeProsody(
  serverEnv: ServerEnv,
  projectPath: string,
  targets: readonly ProsodyTarget[],
): Promise<ProsodyAnalysis[]> {
  const analyzed = await analyzeTexts(
    serverEnv,
    targets.map((target) => target.readText),
  );
  const items = targets.map((target, index) => {
    const base = analyzed[index];
    if (!base) {
      throw new Error(`haqumei-api analyze returned no item for ${target.readText}`);
    }
    return { target, base };
  });
  return runPool(items, PROSODY_CONCURRENCY, ({ target, base }) =>
    target.g2p
      ? fromSavedKana(serverEnv, projectPath, base, target.g2p)
      : fromAnalyzer(serverEnv, projectPath, base),
  );
}
