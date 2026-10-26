import type { AvatarOverride, VoiceOption } from "@/_schemas";
import type { TtsFormValues } from "@/app/features/tts/model/tts-form-schema";
import { createTtsInput } from "@/app/features/tts";
import { applyTtsVoiceChange } from "@/app/features/tts/lib/apply-tts-voice-change";
import { toAvatarOverride } from "@/app/features/tts/lib/avatar-override";
import type { ZenAliasTarget } from "@/app/features/zen/types";

export function createZenTts(
  options: VoiceOption[],
  target: ZenAliasTarget,
  text: string,
  avatarOverride: AvatarOverride | undefined,
): TtsFormValues {
  const draft = createTtsInput(options, undefined);
  const withVoice = applyTtsVoiceChange(draft, target.voice);
  const avatar = toAvatarOverride(avatarOverride);

  return {
    ...withVoice,
    text,
    readText: text,
    ...(avatar ? { avatar } : {}),
    synthesisSettings: null,
  };
}
