import { phonemeSpell } from "../spelling/fish-phonemes";
import { openRouterSpeech, taggedText } from "./openrouter-speech";
import type { ProsodySourceAdapter } from "./types";

/**
 * Fish Audio Drama 3 through OpenRouter ($10 / M UTF-8 bytes until 2026-11-30, then $50). Words
 * are respelled as Fish phoneme tags with the pitch of each mora. No previous / next text.
 * Fish Official voices: Hina `bf5634e34ee5489991fe687ad0d202c5`, Shiori
 * `5da7f24e9e274f91b2b677669c818ce9`.
 */
const DRAMA_3 = {
  model: "fish-audio/drama-3",
  /** `response_format: "pcm"` is 44.1 kHz mono s16le. */
  sampleRate: 44_100,
  timeoutMs: 120_000,
  retryLimit: 3,
} as const;

export const drama3Source: ProsodySourceAdapter = {
  version: "drama3-v1",
  takesContext: false,
  spell: phonemeSpell,
  synthesize: (serverEnv, { text, voice, tag }) =>
    openRouterSpeech(serverEnv, DRAMA_3, {
      model: DRAMA_3.model,
      input: taggedText(text, tag),
      voice,
    }),
};
