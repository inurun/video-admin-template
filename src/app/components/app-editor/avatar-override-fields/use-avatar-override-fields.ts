import {
  avatarOptions,
  getOpenedMouthOptions,
  type AvatarOverride,
  type AvatarSettings,
  type AvatarType,
} from "@/_schemas";
import { toAvatarOverride } from "@/app/features/tts/lib/avatar-override";

export function useAvatarOverrideFields({
  avatarType,
  value,
  inherited,
  onChange,
}: {
  avatarType: AvatarType;
  value: AvatarOverride | undefined;
  inherited: AvatarSettings;
  onChange: (value: AvatarOverride | undefined) => void;
}) {
  const options = { ...avatarOptions[avatarType], mouth: getOpenedMouthOptions(avatarType) };
  const fields = (["base", "eyes", "mouth"] as const).map((field) => ({
    field,
    value: value?.[field] ?? "",
    inherited: inherited[field],
    options: options[field] as readonly string[],
  }));

  const change = (field: keyof AvatarOverride, next: string) => {
    onChange(toAvatarOverride({ ...value, [field]: next || undefined }));
  };

  return { fields, change };
}
