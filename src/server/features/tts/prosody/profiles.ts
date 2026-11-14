import type { OpenRouterProfile } from "@/server/core/openrouter";

/** Reference TTS for prosody. Every field but the timeouts is part of the source cache key. */
export const PROSODY_SOURCE = {
  id: "eleven-v4-v1",
  model: "elevenlabs/eleven-v4",
  /** A character without its own voice in `speechVoiceConfig` reads with this one. */
  voice: "sarah",
  /** `response_format: "pcm"` is 24 kHz mono s16le. */
  sampleRate: 24_000,
  timeoutMs: 120_000,
  retryLimit: 3,
} as const;

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
