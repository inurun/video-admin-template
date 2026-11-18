/**
 * What Auto Expression may pick as a line's voice emotion, with its meaning (for the LLM and the
 * editor) and the Drama 3 direction the prosody reference reads it with. `neutral` has no
 * direction: the reference reads without one.
 */
export const voiceEmotions = {
  neutral: { meaning: "平常" },
  joy: { meaning: "嬉しい・楽しい", direction: "[happy, cheerful]" },
  annoyed: { meaning: "苛立ち・怒り", direction: "[annoyed, irritated]" },
  exasperated: { meaning: "呆れ・ツッコミ", direction: "[exasperated]" },
  embarrassed: { meaning: "照れ", direction: "[embarrassed, shy]" },
  surprise: { meaning: "驚き", direction: "[surprised]" },
  disappointed: { meaning: "落胆・げんなり", direction: "[disappointed, deflated]" },
  confused: { meaning: "困惑・戸惑い", direction: "[confused, hesitant]" },
} as const satisfies Record<string, { meaning: string; direction?: string }>;

export type VoiceEmotion = keyof typeof voiceEmotions;

export const VOICE_EMOTIONS = Object.keys(voiceEmotions) as [VoiceEmotion, ...VoiceEmotion[]];

export const DEFAULT_VOICE_EMOTION: VoiceEmotion = "neutral";

/** The Drama 3 direction of an emotion; none for neutral or unset. */
export function voiceEmotionDirection(emotion: VoiceEmotion | undefined) {
  const entry = voiceEmotions[emotion ?? DEFAULT_VOICE_EMOTION];
  return "direction" in entry ? entry.direction : undefined;
}
