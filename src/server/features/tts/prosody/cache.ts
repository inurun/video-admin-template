import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { prosodyExtractSchema, type G2pItem, type ProsodyExtract } from "@/_schemas";
import { getProjectTtsDir } from "@/server/_shared/storage";
import { stableStringify } from "@/server/_shared/stable-stringify";
import { getSpeechPipeline, toSynthesisProsody } from "@/server/features/tts/speech-pipeline";
import type { SynthesisProsody, TtsProvider } from "@/server/features/tts/providers/types";
import { wordsOf } from "./reading-check";
import { prosodySourceFor, type ProsodySource, type ProsodySpeaker } from "./source-config";

function hash(value: unknown) {
  return crypto.createHash("md5").update(stableStringify(value)).digest("hex");
}

function prosodyDir(projectPath: string) {
  return path.join(getProjectTtsDir(projectPath), "prosody");
}

/** The reference audio depends on the text and the word readings, not on accents or phrases. */
export function prosodySourcePath(
  projectPath: string,
  g2p: Pick<G2pItem, "text" | "kana">,
  source: ProsodySource,
) {
  const readings = wordsOf(g2p.kana).map((word) => [word.surface, word.reading]);
  return path.join(
    prosodyDir(projectPath),
    `${hash({ readText: g2p.text, readings, source })}.wav`,
  );
}

/**
 * The extract depends on the whole kana (moras and pause marks). The file keeps the
 * aligner_version it was made with; clearing the TTS cache makes it again.
 */
export function prosodyExtractPath(
  projectPath: string,
  g2p: Pick<G2pItem, "text" | "kana">,
  source: ProsodySource,
) {
  return path.join(
    prosodyDir(projectPath),
    `${hash({ readText: g2p.text, kana: g2p.kana, source })}.json`,
  );
}

async function readOptional(filePath: string) {
  try {
    return await fs.readFile(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function writeFile(filePath: string, data: Buffer | string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data);
}

export function readCachedProsodySource(projectPath: string, g2p: G2pItem, source: ProsodySource) {
  return readOptional(prosodySourcePath(projectPath, g2p, source));
}

export function writeCachedProsodySource(
  projectPath: string,
  g2p: G2pItem,
  source: ProsodySource,
  wav: Buffer,
) {
  return writeFile(prosodySourcePath(projectPath, g2p, source), wav);
}

export async function readCachedProsody(
  projectPath: string,
  g2p: G2pItem,
  source: ProsodySource,
): Promise<ProsodyExtract | undefined> {
  const raw = await readOptional(prosodyExtractPath(projectPath, g2p, source));
  if (!raw) {
    return undefined;
  }
  try {
    return prosodyExtractSchema.parse(JSON.parse(raw.toString("utf8")));
  } catch {
    return undefined;
  }
}

export function writeCachedProsody(
  projectPath: string,
  g2p: G2pItem,
  source: ProsodySource,
  extract: ProsodyExtract,
) {
  return writeFile(prosodyExtractPath(projectPath, g2p, source), `${JSON.stringify(extract)}\n`);
}

/** Synthesis prosody for this kana when the engine runs the prosody pipeline and it is cached. */
export async function findSynthesisProsody(
  projectPath: string,
  voice: ProsodySpeaker & { provider: TtsProvider },
  g2p: G2pItem | undefined,
): Promise<SynthesisProsody | undefined> {
  if (!g2p || getSpeechPipeline(voice.provider).pipeline !== "prosody") {
    return undefined;
  }
  return toSynthesisProsody(
    voice.provider,
    await readCachedProsody(projectPath, g2p, prosodySourceFor(voice)),
  );
}
