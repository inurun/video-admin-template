import type { PageFormValues } from "@/app/features/page/model/page-form-schema";
import { useCallback } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import {
  DEFAULT_VOICE_EMOTION,
  getAvatarTypeForVoice,
  resolveAvatarSettings,
  VOICE_EMOTIONS,
  type AvatarOverride,
  type VoiceEmotion,
} from "@/_schemas";
import { MANUAL_AVATAR_SOURCE, useSelectedTts, useTtsFormIndex } from "@/app/features/tts";

export function useAvatarSettingsField() {
  const { control, setValue } = useFormContext<PageFormValues>();
  const { ttsId } = useSelectedTts();
  const ttsIndex = useTtsFormIndex(ttsId);
  const tts = useWatch({ control, name: `tts.${Math.max(ttsIndex, 0)}` });
  const page = useWatch({ control, name: ["type", "meta"] });

  const onChange = useCallback(
    (value: AvatarOverride | undefined) => {
      setValue(`tts.${ttsIndex}.avatar`, value, { shouldDirty: true });
      setValue(`tts.${ttsIndex}.avatarSource`, MANUAL_AVATAR_SOURCE, { shouldDirty: true });
    },
    [setValue, ttsIndex],
  );

  /** A hand-picked emotion makes the line manual, like its avatar: auto leaves both alone. */
  const onVoiceEmotionChange = useCallback(
    (value: string) => {
      const emotion = VOICE_EMOTIONS.find((option) => option === value);
      setValue(
        `tts.${ttsIndex}.voiceEmotion`,
        emotion === DEFAULT_VOICE_EMOTION ? undefined : emotion,
        { shouldDirty: true },
      );
      setValue(`tts.${ttsIndex}.avatarSource`, MANUAL_AVATAR_SOURCE, { shouldDirty: true });
    },
    [setValue, ttsIndex],
  );

  if (ttsIndex < 0 || !tts) {
    return null;
  }

  const [type, meta] = page;
  const avatarType = getAvatarTypeForVoice(tts);
  const pageDefault = type === "main" && "avatars" in meta ? meta.avatars?.[avatarType] : undefined;

  return {
    avatar: {
      avatarType,
      value: tts.avatar,
      inherited: resolveAvatarSettings(avatarType, pageDefault),
      onChange,
    },
    voiceEmotion: (tts.voiceEmotion ?? DEFAULT_VOICE_EMOTION) satisfies VoiceEmotion,
    voiceEmotionOptions: VOICE_EMOTIONS,
    onVoiceEmotionChange,
  };
}
