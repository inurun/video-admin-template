import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import {
  prosodyExtractSchema,
  prosodySettledSchema,
  type G2pItem,
  type ProsodyExtract,
  type ProsodySettled,
} from "@/_schemas";
import { PROSODY_CACHE_DIR } from "@/server/_shared/storage";
import { stableStringify } from "@/server/_shared/stable-stringify";
import { getSpeechPipeline, toSynthesisProsody } from "@/server/features/tts/speech-pipeline";
import type { SynthesisProsody, TtsProvider } from "@/server/features/tts/providers/types";
import { prosodySourceFor, type ProsodySource, type ProsodySpeaker } from "./source-config";

function hash(value: unknown) {
  return crypto.createHash("md5").update(stableStringify(value)).digest("hex");
}

/**
 * The extract depends on the whole kana (moras and pause marks). Shared by every project; the
 * file keeps the aligner_version it was made with, and deleting cache/prosody makes it again.
 */
export function prosodyExtractPath(g2p: Pick<G2pItem, "text" | "kana">, source: ProsodySource) {
  return path.join(
    PROSODY_CACHE_DIR,
    "extract",
    `${hash({ readText: g2p.text, kana: g2p.kana, source })}.json`,
  );
}

/** The settled kana for an analyzer kana; a dictionary change gives another analyzer kana. */
export function prosodySettledPath(
  analyzed: Pick<G2pItem, "text" | "kana">,
  source: ProsodySource,
) {
  return path.join(
    PROSODY_CACHE_DIR,
    "settled",
    `${hash({ readText: analyzed.text, kana: analyzed.kana, source })}.json`,
  );
}

async function readJson<T>(filePath: string, schema: z.ZodType<T>): Promise<T | undefined> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  try {
    return schema.parse(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value)}\n`);
}

export function readCachedProsody(
  g2p: G2pItem,
  source: ProsodySource,
): Promise<ProsodyExtract | undefined> {
  return readJson(prosodyExtractPath(g2p, source), prosodyExtractSchema);
}

export function writeCachedProsody(g2p: G2pItem, source: ProsodySource, extract: ProsodyExtract) {
  return writeJson(prosodyExtractPath(g2p, source), extract);
}

export async function readSettledG2p(
  analyzed: G2pItem,
  source: ProsodySource,
): Promise<G2pItem | undefined> {
  return (await readJson(prosodySettledPath(analyzed, source), prosodySettledSchema))?.g2p;
}

export function writeSettledG2p(analyzed: G2pItem, source: ProsodySource, g2p: G2pItem) {
  return writeJson(prosodySettledPath(analyzed, source), { g2p } satisfies ProsodySettled);
}

/** Synthesis prosody for this kana when the engine runs the prosody pipeline and it is cached. */
export async function findSynthesisProsody(
  voice: ProsodySpeaker & { provider: TtsProvider },
  g2p: G2pItem | undefined,
): Promise<SynthesisProsody | undefined> {
  if (!g2p || getSpeechPipeline(voice.provider).pipeline !== "prosody") {
    return undefined;
  }
  return toSynthesisProsody(voice.provider, await readCachedProsody(g2p, prosodySourceFor(voice)));
}
