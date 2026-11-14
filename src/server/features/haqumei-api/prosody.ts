import { prosodyExtractSchema, type G2pItem, type ProsodyExtract } from "@/_schemas";
import type { ServerEnv } from "@/server/core/env";
import { toG2pItem } from "@/server/features/tts/g2p-item";
import { getHaqumeiApiClient, unwrapHaqumeiData } from "./client";
import { HAQUMEI_SCHEMA_VERSION } from "./limits";

/** Aligns the reference WAV to the kana's moras and returns their timing and log F0. */
export async function extractProsody(
  serverEnv: ServerEnv,
  item: G2pItem,
  wav: Buffer,
): Promise<ProsodyExtract> {
  const response = await getHaqumeiApiClient(serverEnv).POST("/v1/prosody/extract", {
    body: {
      schema_version: HAQUMEI_SCHEMA_VERSION,
      item: toG2pItem(item),
      audio: { wav_base64: wav.toString("base64") },
    },
  });
  const data = unwrapHaqumeiData(response);
  if (data.schema_version !== HAQUMEI_SCHEMA_VERSION) {
    throw new Error(`haqumei-api prosody extract returned schema_version ${data.schema_version}`);
  }
  return prosodyExtractSchema.parse(data);
}
