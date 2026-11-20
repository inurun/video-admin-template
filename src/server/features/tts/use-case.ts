import type { G2pItem, VoiceOption } from "@/_schemas";
import type { ServerEnv } from "@/server/core/env";
import { clearProjectTtsCache, readSavedProject } from "@/server/_shared/storage";
import { analyzeText } from "@/server/features/haqumei-api/analyze";
import { validateG2pItem } from "@/server/features/haqumei-api/validate";
import {
  listOptionalCoeiroinkVoices,
  listOptionalVoisonaVoices,
  listVoicevoxVoices,
} from "@/server/features/haqumei-api/voices";
import { getHaqumeiApiUrl } from "@/server/features/haqumei-api/client";
import { getVoicepeakBase, listVoicepeakVoices } from "@/server/features/voicepeak/use-case";
import {
  ttsClearCacheRequestSchema,
  ttsG2pGenerateRequestSchema,
  ttsSynthesizeRequestSchema,
  ttsValidateRequestSchema,
} from "./contract";
import { getEffectiveReadText, getUsableG2p } from "./providers/comparison";
import { getTtsProvider } from "./providers/registry";
import type { TtsProvider } from "./providers/types";
import { findSynthesisProsody } from "./prosody/cache";
import { analyzeProsody } from "./prosody/pipeline";
import { prosodySourceFor } from "./prosody/source-config";
import { prosodyContextOfEdited, toProsodyContextLine } from "./prosody/context";
import { getSpeechPipeline } from "./speech-pipeline";
import { enqueueProjectMutation } from "@/server/features/project/project-mutation-queue";
import { TtsCacheClearConflictError } from "@/server/features/tts/errors";

import { buildSingleG2pContext } from "./g2p-context";
import { generateG2p, generateG2pWithCache } from "./llm-g2p";
import { speechVoiceConfig } from "@/video/config";

async function loadProviderVoices<T>(label: string, baseUrl: string, task: Promise<T>): Promise<T> {
  try {
    return await task;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load ${label} voices (${baseUrl}): ${detail}`, { cause: error });
  }
}

async function loadOptionalProviderVoices(
  label: string,
  baseUrl: string,
  task: Promise<VoiceOption[]>,
): Promise<VoiceOption[]> {
  try {
    return await task;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`Skipping ${label} voices (${baseUrl}): ${detail}`);
    return [];
  }
}

export async function listTtsVoices(serverEnv: ServerEnv) {
  const haqumeiApiUrl = getHaqumeiApiUrl(serverEnv);
  const [voisona, voicevox, voicepeak, coeiroink] = await Promise.all([
    loadProviderVoices("VoiSona", haqumeiApiUrl, listOptionalVoisonaVoices(serverEnv)),
    loadProviderVoices("VOICEVOX", haqumeiApiUrl, listVoicevoxVoices(serverEnv)),
    loadOptionalProviderVoices(
      "VoicePeak",
      getVoicepeakBase(serverEnv),
      listVoicepeakVoices(serverEnv),
    ),
    loadProviderVoices("COEIROINK", haqumeiApiUrl, listOptionalCoeiroinkVoices(serverEnv)),
  ]);

  return [...voisona, ...voicevox, ...voicepeak, ...coeiroink];
}

async function generateSingleG2p(
  serverEnv: ServerEnv,
  input: Parameters<typeof buildSingleG2pContext>[0],
) {
  const result = (
    await generateG2p(serverEnv, {
      mode: "single",
      pages: buildSingleG2pContext(input),
    })
  ).get(input.id);
  if (!result) {
    throw new Error(`G2P generation returned no item for tts ${input.id}`);
  }
  return result;
}

/** 試聴は読みキャッシュを使う。作り直し（generateTtsG2p）は常に LLM に聞く。 */
async function generatePreviewG2p(
  serverEnv: ServerEnv,
  text: string,
  provider: Parameters<typeof buildSingleG2pContext>[0]["provider"],
) {
  const result = (
    await generateG2pWithCache(serverEnv, {
      mode: "single",
      pages: buildSingleG2pContext({ pageId: "preview", id: "preview", text, provider }),
    })
  ).get("preview");
  if (!result) {
    throw new Error("G2P generation returned no item for preview");
  }
  return result.g2p;
}

/** 試聴の読み: 渡された g2p、無ければ方式ごとの土台（prosody は analyze、llm-g2p は LLM）。 */
async function resolvePreviewG2p(
  serverEnv: ServerEnv,
  provider: TtsProvider,
  readText: string,
  g2p: unknown,
): Promise<G2pItem | undefined> {
  const { pipeline } = getSpeechPipeline(provider);
  if (pipeline === "none") {
    return undefined;
  }
  const usable = getUsableG2p(g2p, readText);
  if (usable) {
    return usable;
  }
  return pipeline === "prosody"
    ? analyzeText(serverEnv, readText)
    : generatePreviewG2p(serverEnv, readText, provider);
}

/**
 * Regenerate. A prosody engine analyzes again and makes and checks a new reference (the saved
 * kana and the cached reference are not used); the others ask the LLM again.
 */
export async function generateTtsG2p(serverEnv: ServerEnv, input: unknown) {
  const { projectPath, pageId, item } = ttsG2pGenerateRequestSchema.parse(input);
  if (item.provider !== "coeiroink" && getSpeechPipeline(item.provider).pipeline === "prosody") {
    // The saved page around the edited line, as a save would hear it.
    const context = prosodyContextOfEdited(
      (await readSavedProject(projectPath)).pages,
      toProsodyContextLine(item),
      speechVoiceConfig.context,
    );
    const [result] = await analyzeProsody(
      serverEnv,
      [
        {
          readText: getEffectiveReadText(item),
          source: prosodySourceFor({
            provider: item.provider,
            voiceName: item.voiceName,
            voiceVersion: item.voiceVersion,
          }),
          ...(context ? { context } : {}),
        },
      ],
      { fresh: true },
    );
    if (!result) {
      throw new Error(`Prosody analysis returned no item for tts ${item.id}`);
    }
    return { g2p: result.g2p, source: result.prosody ? "prosody" : "analyze" } as const;
  }
  return generateSingleG2p(serverEnv, {
    pageId,
    id: item.id,
    text: getEffectiveReadText(item),
    provider: item.provider,
    previous: item.previous ? getEffectiveReadText(item.previous) : undefined,
    next: item.next ? getEffectiveReadText(item.next) : undefined,
  });
}

export async function validateTtsG2p(serverEnv: ServerEnv, input: unknown) {
  const parsed = ttsValidateRequestSchema.parse(input);
  return { g2p: await validateG2pItem(serverEnv, parsed) };
}

export async function synthesizeTts(serverEnv: ServerEnv, input: unknown) {
  const parsed = ttsSynthesizeRequestSchema.parse(input);
  const provider = getTtsProvider(parsed.provider);
  const readText = getEffectiveReadText(parsed);
  const g2p = await resolvePreviewG2p(serverEnv, parsed.provider, readText, parsed.g2p);
  const prosody = await findSynthesisProsody(parsed, g2p);
  const synthesisInput = {
    ...parsed,
    readText,
    ...(g2p ? { g2p } : {}),
    ...(prosody ? { prosody } : {}),
    synthesisSettings: parsed.synthesisSettings ?? undefined,
    ...(parsed.provider === "coeiroink" ? {} : { voiceVersion: parsed.voiceVersion ?? "" }),
  };

  return provider.synthesize(serverEnv, synthesisInput as never);
}

export async function clearTtsCache(input: unknown) {
  const parsed = ttsClearCacheRequestSchema.parse(input);
  return enqueueProjectMutation(parsed.projectPath, async () => {
    const project = await readSavedProject(parsed.projectPath);
    if (
      project.pages.some(
        (page) =>
          page.type !== "transition" &&
          page.tts.some(
            (tts) => tts.audio.status === "analyzing" || tts.audio.status === "pending",
          ),
      )
    ) {
      throw new TtsCacheClearConflictError();
    }
    await clearProjectTtsCache(parsed.projectPath);
    return { ok: true as const };
  });
}
