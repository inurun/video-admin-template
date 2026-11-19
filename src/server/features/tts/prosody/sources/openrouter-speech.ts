import type { ServerEnv } from "@/server/core/env";
import { OpenRouterError, postOpenRouter, type OpenRouterProfile } from "@/server/core/openrouter";

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

/** OpenRouter `/audio/speech` with `response_format: "pcm"`, returned as a WAV. */
export async function openRouterSpeech(
  serverEnv: ServerEnv,
  profile: Pick<OpenRouterProfile, "timeoutMs" | "retryLimit"> & { sampleRate: number },
  body: Record<string, unknown>,
) {
  const apiKey = serverEnv.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new OpenRouterError("OPENROUTER_API_KEY is not set");
  }

  const response = await postOpenRouter(
    OPENROUTER_SPEECH_URL,
    apiKey,
    profile,
    JSON.stringify({ ...body, response_format: "pcm" }),
  );
  if (!response.ok) {
    const text = await response.text();
    throw new OpenRouterError(
      `OpenRouter speech failed: HTTP ${response.status}${text ? ` ${text}` : ""}`,
      response.status,
      text,
    );
  }

  const pcm = Buffer.from(await response.arrayBuffer());
  if (pcm.length === 0) {
    throw new OpenRouterError("OpenRouter speech returned no audio", response.status);
  }
  return wavFromPcm(pcm, profile.sampleRate);
}

/** The text with its tag first. */
export const taggedText = (text: string, tag: string) => (tag ? `${tag} ${text}` : text);
