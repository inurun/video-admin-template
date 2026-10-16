import type { DictionaryEntryInput, G2pItem, VoicevoxSynthesisSettings } from "@/_schemas";
import { DEFAULT_VOICE_PRESETS } from "@/_schemas";
import type { ServerEnv } from "@/server/core/env";
import { getHaqumeiApiClient, unwrapHaqumeiData } from "@/server/features/haqumei-api/client";
import { analyzeText } from "@/server/features/haqumei-api/analyze";
import { HaqumeiApiError } from "@/server/features/haqumei-api/error";
import { buildVoicevoxSynthesisRequest } from "@/server/features/haqumei-api/synthesis-settings";

const PREVIEW_SPEAKER = 3;

export async function listDictionary(serverEnv: ServerEnv) {
  return unwrapHaqumeiData(await getHaqumeiApiClient(serverEnv).GET("/v1/dictionary"));
}

export async function getDictionaryEntry(serverEnv: ServerEnv, id: number) {
  return unwrapHaqumeiData(
    await getHaqumeiApiClient(serverEnv).GET("/v1/dictionary/entries/{id}", {
      params: { path: { id } },
    }),
  );
}

export async function createDictionaryEntry(serverEnv: ServerEnv, body: DictionaryEntryInput) {
  return unwrapHaqumeiData(
    await getHaqumeiApiClient(serverEnv).POST("/v1/dictionary/entries", { body }),
  );
}

export async function updateDictionaryEntry(
  serverEnv: ServerEnv,
  id: number,
  body: DictionaryEntryInput,
) {
  return unwrapHaqumeiData(
    await getHaqumeiApiClient(serverEnv).PUT("/v1/dictionary/entries/{id}", {
      params: { path: { id } },
      body,
    }),
  );
}

export async function deleteDictionaryEntry(serverEnv: ServerEnv, id: number) {
  const result = await getHaqumeiApiClient(serverEnv).DELETE("/v1/dictionary/entries/{id}", {
    params: { path: { id } },
  });
  if (!result.response.ok) throw HaqumeiApiError.fromUnknown(result.error, result.response.status);
}

/** 辞書の確認用。haqumei が辞書をどう読むかを見るので、LLM は通さない。 */
export async function analyzeDictionaryText(serverEnv: ServerEnv, text: string) {
  return { g2p: await analyzeText(serverEnv, text) };
}

export async function previewDictionaryEntry(serverEnv: ServerEnv, g2p: G2pItem) {
  const preset = DEFAULT_VOICE_PRESETS[`voicevox::${PREVIEW_SPEAKER}::`];
  const response = await getHaqumeiApiClient(serverEnv).POST("/v1/synthesis/voicevox", {
    body: buildVoicevoxSynthesisRequest({
      item: g2p,
      speaker: PREVIEW_SPEAKER,
      synthesisSettings: preset?.synthesisSettings as VoicevoxSynthesisSettings | undefined,
    }),
    parseAs: "blob",
  });
  return unwrapHaqumeiData(response);
}
