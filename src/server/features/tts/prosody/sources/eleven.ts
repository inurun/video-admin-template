import { katakanaSpell } from "../spelling/katakana";
import { openRouterSpeech, taggedText } from "./openrouter-speech";
import type { ProsodySourceAdapter } from "./types";

/**
 * ElevenLabs v4 Turbo through OpenRouter ($40 / M characters, audio tags count). Words are
 * respelled in katakana (no SSML or phonemes). `previous_text` / `next_text` are heard, not read
 * nor billed. `stability` 1 and `style` 1 with a fixed seed were picked in a listening test
 * (2026-11-19).
 */
const ELEVEN_V4_TURBO = {
  model: "elevenlabs/eleven-v4-turbo",
  /** `response_format: "pcm"` is 24 kHz mono s16le. */
  sampleRate: 24_000,
  voiceSettings: { stability: 1, style: 1 },
  seed: 7,
  timeoutMs: 120_000,
  retryLimit: 3,
} as const;

export const elevenV4TurboSource: ProsodySourceAdapter = {
  version: "eleven-v4-turbo-v1",
  takesContext: true,
  spell: katakanaSpell,
  synthesize: (serverEnv, { text, voice, tag, context }) =>
    openRouterSpeech(serverEnv, ELEVEN_V4_TURBO, {
      model: ELEVEN_V4_TURBO.model,
      input: taggedText(text, tag),
      voice,
      provider: {
        options: {
          elevenlabs: {
            voice_settings: ELEVEN_V4_TURBO.voiceSettings,
            seed: ELEVEN_V4_TURBO.seed,
            ...(context?.previous ? { previous_text: context.previous } : {}),
            ...(context?.next ? { next_text: context.next } : {}),
          },
        },
      },
    }),
};
