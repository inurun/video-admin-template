import { AvatarOverrideFields } from "@/app/components/app-editor/avatar-override-fields/avatar-override-fields";
import { useAvatarSettingsField } from "./use-avatar-settings-field";

export function AvatarSettingsField() {
  const field = useAvatarSettingsField();

  if (!field) {
    return null;
  }

  return <AvatarOverrideFields {...field} />;
}
