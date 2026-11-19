import type { OpenRouterProfile } from "@/server/core/openrouter";

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
