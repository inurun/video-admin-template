import {
  avatarOptions,
  getOpenedMouthOptions,
  type AvatarOverride,
  type AvatarType,
} from "@/_schemas";
import { toAvatarOverride } from "@/app/features/tts/lib/avatar-override";

export const avatarTokenFields = { b: "base", e: "eyes", m: "mouth" } as const;

export function getZenAvatarOptions(type: AvatarType) {
  return { ...avatarOptions[type], mouth: getOpenedMouthOptions(type) };
}

/** Tokens are TTS overrides; omitted fields fall back to the page default. */
export function parseAvatarTokens(tokens: string[], type: AvatarType): AvatarOverride | undefined {
  const avatar: AvatarOverride = {};
  const options = getZenAvatarOptions(type);
  const seen = new Set<string>();
  for (const token of tokens) {
    const match = /^([bem])\.(.+)$/.exec(token);
    if (!match) throw new Error(`Invalid avatar token "${token}".`);
    const key = match[1] as keyof typeof avatarTokenFields;
    const field = avatarTokenFields[key];
    if (seen.has(key)) throw new Error(`Duplicate avatar key "${key}".`);
    seen.add(key);
    const value = match[2];
    if (!(options[field] as readonly string[]).includes(value)) {
      throw new Error(`Unknown ${field} "${value}".`);
    }
    avatar[field] = value;
  }
  return toAvatarOverride(avatar);
}

export function serializeAvatarTokens(avatar: AvatarOverride | undefined) {
  return Object.entries(avatarTokenFields)
    .flatMap(([key, field]) => (avatar?.[field] ? [`${key}.${avatar[field]}`] : []))
    .join(" ");
}
