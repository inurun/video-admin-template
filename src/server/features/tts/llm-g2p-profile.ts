import type { OpenRouterProfile } from "@/server/core/openrouter";

export const LLM_G2P_PROFILE = {
  id: "gemini-4-argon-oneshot-v3",
  model: "google/gemini-4-argon",
  reasoningEffort: "medium",
  timeoutMs: 180_000,
  maxTokens: 32_768,
  chunkSize: 12,
  concurrency: 3,
  retryLimit: 3,
} as const satisfies OpenRouterProfile & { chunkSize: number; concurrency: number };

export function chunkItems<T>(items: readonly T[], chunkSize: number) {
  const size = Math.max(1, chunkSize);
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
