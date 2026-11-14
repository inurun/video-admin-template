import type { OpenRouterProfile } from "@/server/core/openrouter";

/** Reference TTS for prosody. Every field but the timeouts is part of the source cache key. */
export const PROSODY_SOURCE = {
  id: "gemini-3.8-flash-tts-zephyr-v1",
  model: "google/gemini-3.8-flash-tts",
  voice: "Zephyr",
  instructions: "標準的な東京アクセントで、ふつうの会話のように自然に読む。間を空けずに読む。",
  /** `response_format: "pcm"` is 24 kHz mono s16le. */
  sampleRate: 24_000,
  timeoutMs: 120_000,
  retryLimit: 3,
} as const;

/** Listens to the reference audio and reports words read differently from the analyzer. */
export const LLM_READING_CHECK_PROFILE = {
  id: "gemini-3.8-flash-reading-check-v1",
  model: "google/gemini-3.8-flash",
  reasoningEffort: "low",
  timeoutMs: 120_000,
  maxTokens: 8_192,
  retryLimit: 3,
} as const satisfies OpenRouterProfile;
