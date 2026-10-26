import type { AvatarOverride } from "@/_schemas";

const AVATAR_FIELDS = ["base", "eyes", "mouth"] as const;

/** Keeps only set fields in a stable order; an empty override becomes undefined. */
export function toAvatarOverride(value: AvatarOverride | undefined): AvatarOverride | undefined {
  const entries = AVATAR_FIELDS.flatMap((field) => {
    const fieldValue = value?.[field];
    return fieldValue ? [[field, fieldValue] as const] : [];
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function avatarOverridesEqual(
  left: AvatarOverride | undefined,
  right: AvatarOverride | undefined,
) {
  return AVATAR_FIELDS.every((field) => left?.[field] === right?.[field]);
}
