import type { OpenRouterProfile } from "@/server/core/openrouter";
import type { ProsodySourceVoice } from "@/video-host/contract";

/**
 * Reference TTS for prosody; the voice and audio tags come from `speechVoiceConfig`.
 * Every field but the timeouts is part of the source cache key.
 */
export const PROSODY_SOURCE = {
  id: "drama3-v1",
  model: "fish-audio/drama-3",
  /** `response_format: "pcm"` is 44.1 kHz mono s16le. */
  sampleRate: 44_100,
  timeoutMs: 120_000,
  retryLimit: 3,
} as const;

/** Fish Audio voice library ids of the reference voices (Fish Official). */
export const PROSODY_SOURCE_VOICES = {
  hina: "bf5634e34ee5489991fe687ad0d202c5",
  shiori: "5da7f24e9e274f91b2b677669c818ce9",
} as const satisfies Record<ProsodySourceVoice, string>;

/**
 * Listens to the reference audio and reports words read differently from the analyzer.
 * Utterances are checked `chunkSize` at a time in one request, like the LLM G2P chunks.
 */
export const LLM_READING_CHECK_PROFILE = {
  id: "gemini-3.8-flash-reading-check-v2",
  model: "google/gemini-3.8-flash",
  reasoningEffort: "low",
  timeoutMs: 180_000,
  maxTokens: 16_384,
  chunkSize: 12,
  concurrency: 3,
  retryLimit: 3,
} as const satisfies OpenRouterProfile & { chunkSize: number; concurrency: number };
