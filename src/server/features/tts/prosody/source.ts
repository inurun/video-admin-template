import type { ServerEnv } from "@/server/core/env";
import { OpenRouterError, postOpenRouter } from "@/server/core/openrouter";
import { PROSODY_SOURCE, PROSODY_SOURCE_VOICES } from "./profiles";
import type { ProsodySource } from "./source-config";

const OPENROUTER_SPEECH_URL = "https://openrouter.ai/api/v1/audio/speech";

/** Wraps mono 16-bit PCM in a WAV header. */
export function wavFromPcm(pcm: Buffer, sampleRate: number) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Reads `text` with the reference TTS of `source` (its tag first) and returns a WAV. */
export async function synthesizeProsodySource(
  serverEnv: ServerEnv,
  text: string,
  source: ProsodySource,
) {
  const apiKey = serverEnv.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new OpenRouterError("OPENROUTER_API_KEY is not set");
  }

  const response = await postOpenRouter(
    OPENROUTER_SPEECH_URL,
    apiKey,
    PROSODY_SOURCE,
    JSON.stringify({
      model: source.model,
      input: source.tag ? `${source.tag} ${text}` : text,
      voice: PROSODY_SOURCE_VOICES[source.voice],
      response_format: "pcm",
    }),
  );
  if (!response.ok) {
    const body = await response.text();
    throw new OpenRouterError(
      `OpenRouter speech failed: HTTP ${response.status}${body ? ` ${body}` : ""}`,
      response.status,
      body,
    );
  }

  const pcm = Buffer.from(await response.arrayBuffer());
  if (pcm.length === 0) {
    throw new OpenRouterError("OpenRouter speech returned no audio", response.status);
  }
  return wavFromPcm(pcm, source.sampleRate);
}
