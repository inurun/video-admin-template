import { resolveAvatarSettings, type AvatarOverride, type AvatarType } from "@/_schemas";
import type { PageSettingsFormValues } from "../page-settings-dialog.lib";

export function useMainAvatarDefaultsField({
  avatarTypes,
  value,
  onChange,
}: {
  avatarTypes: readonly AvatarType[];
  value: PageSettingsFormValues["avatars"];
  onChange: (value: PageSettingsFormValues["avatars"]) => void;
}) {
  const rows = avatarTypes.map((avatarType) => ({
    avatarType,
    value: value[avatarType],
    inherited: resolveAvatarSettings(avatarType),
    onChange: (override: AvatarOverride | undefined) => {
      const { [avatarType]: _removed, ...rest } = value;
      onChange(override ? { ...rest, [avatarType]: override } : rest);
    },
  }));

  return { rows };
}
