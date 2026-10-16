import type { G2pItem } from "@/_schemas";
import type { TtsG2pGenerateRequest, TtsG2pGenerateResponse } from "@/server/features/tts/contract";
import type { TtsFormValues } from "@/app/features/tts/model/tts-form-schema";
import { api } from "@/app/lib/api-client";
import { parseApiJson } from "@/app/lib/fetch-json";
import { getPreviewPayload } from "@/app/features/tts/lib/tts-preview-payload";

export async function requestValidateG2p(item: { text: string; kana: string }) {
  const data = await parseApiJson<{ g2p: G2pItem }>(
    await api.tts.g2p.validate.$post({ json: item }),
  );
  if (!data.g2p) {
    throw new Error("Validate failed");
  }
  return data.g2p;
}

export async function requestG2pGenerate(input: TtsG2pGenerateRequest) {
  return parseApiJson<TtsG2pGenerateResponse>(await api.tts.g2p.generate.$post({ json: input }));
}

export async function requestPreviewSynthesis(item: TtsFormValues, projectPath: string) {
  const data = await parseApiJson<{ audioSrc: string }>(
    await api.tts.synthesize.$post({
      json: getPreviewPayload(item, projectPath),
    }),
  );

  if (!data.audioSrc) {
    throw new Error("Preview failed");
  }

  return data.audioSrc;
}

export async function clearTtsCache(projectPath: string) {
  await parseApiJson<{ ok: true }>(
    await api.tts.cache.$delete({
      json: { projectPath },
    }),
  );
}
