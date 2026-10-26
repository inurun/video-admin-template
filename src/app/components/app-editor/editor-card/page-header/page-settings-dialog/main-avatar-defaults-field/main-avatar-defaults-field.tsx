import type { AvatarType } from "@/_schemas";
import { AvatarOverrideFields } from "@/app/components/app-editor/avatar-override-fields/avatar-override-fields";
import type { PageSettingsFormValues } from "../page-settings-dialog.lib";
import { useMainAvatarDefaultsField } from "./use-main-avatar-defaults-field";

export function MainAvatarDefaultsField(props: {
  avatarTypes: readonly AvatarType[];
  value: PageSettingsFormValues["avatars"];
  onChange: (value: PageSettingsFormValues["avatars"]) => void;
}) {
  const { rows } = useMainAvatarDefaultsField(props);

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">Default avatars</span>
      {rows.map((row) => (
        <div key={row.avatarType} className="grid grid-cols-[4.5rem_1fr] items-center gap-2">
          <span className="text-sm text-muted-foreground">{row.avatarType}</span>
          <AvatarOverrideFields {...row} />
        </div>
      ))}
    </div>
  );
}
