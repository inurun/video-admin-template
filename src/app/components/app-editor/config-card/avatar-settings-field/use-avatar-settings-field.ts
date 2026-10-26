import type { PageFormValues } from "@/app/features/page/model/page-form-schema";
import { useCallback } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { getAvatarTypeForVoice, resolveAvatarSettings, type AvatarOverride } from "@/_schemas";
import { useSelectedTts, useTtsFormIndex } from "@/app/features/tts";

export function useAvatarSettingsField() {
  const { control, setValue } = useFormContext<PageFormValues>();
  const { ttsId } = useSelectedTts();
  const ttsIndex = useTtsFormIndex(ttsId);
  const tts = useWatch({ control, name: `tts.${Math.max(ttsIndex, 0)}` });
  const page = useWatch({ control, name: ["type", "meta"] });

  const onChange = useCallback(
    (value: AvatarOverride | undefined) => {
      setValue(`tts.${ttsIndex}.avatar`, value, { shouldDirty: true });
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
    avatarType,
    value: tts.avatar,
    inherited: resolveAvatarSettings(avatarType, pageDefault),
    onChange,
  };
}
