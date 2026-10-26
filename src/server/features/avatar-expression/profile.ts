import type { OpenRouterProfile } from "@/server/core/openrouter";

export const LLM_AVATAR_PROFILE = {
  id: "gpt-6-luna-none-v2",
  model: "openai/gpt-6-luna",
  reasoningEffort: "none",
  timeoutMs: 60_000,
  maxTokens: 4_096,
  retryLimit: 3,
  /** Past examples per avatar × field × label. */
  examplesPerLabel: 1,
} as const satisfies OpenRouterProfile & { examplesPerLabel: number };

export type AvatarExpressionProfile = OpenRouterProfile & { examplesPerLabel: number };
