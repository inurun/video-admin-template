import type { VoiceOption } from "@/_schemas";
import type { ServerEnv } from "@/server/core/env";
import { clearProjectTtsCache, readSavedProject } from "@/server/_shared/storage";
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
import { enqueueProjectMutation } from "@/server/features/project/project-mutation-queue";
import { TtsCacheClearConflictError } from "@/server/features/tts/errors";

import { buildSingleG2pContext } from "./g2p-context";
import { generateG2p } from "./llm-g2p";

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
  input: { pageId: string; id: string; text: string; previous?: string; next?: string },
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

export async function generateTtsG2p(serverEnv: ServerEnv, input: unknown) {
  const { pageId, item } = ttsG2pGenerateRequestSchema.parse(input);
  return generateSingleG2p(serverEnv, {
    pageId,
    id: item.id,
    text: getEffectiveReadText(item),
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
  const g2p = provider.usesG2p
    ? (getUsableG2p(parsed.g2p, readText) ??
      (await generateSingleG2p(serverEnv, { pageId: "preview", id: "preview", text: readText }))
        .g2p)
    : parsed.g2p;
  const synthesisInput = {
    ...parsed,
    readText,
    ...(g2p ? { g2p } : {}),
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
