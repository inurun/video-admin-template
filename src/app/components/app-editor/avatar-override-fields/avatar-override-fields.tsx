import type { AvatarOverride, AvatarSettings, AvatarType } from "@/_schemas";
import { useAvatarOverrideFields } from "./use-avatar-override-fields";

export function AvatarOverrideFields(props: {
  avatarType: AvatarType;
  value: AvatarOverride | undefined;
  inherited: AvatarSettings;
  onChange: (value: AvatarOverride | undefined) => void;
}) {
  const { fields, change } = useAvatarOverrideFields(props);

  return (
    <div className="grid grid-cols-3 gap-2">
      {fields.map(({ field, value, inherited, options }) => (
        <select
          key={field}
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          value={value}
          onChange={(event) => change(field, event.target.value)}
        >
          <option value="">({inherited})</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ))}
    </div>
  );
}
