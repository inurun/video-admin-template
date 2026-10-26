import crypto from "node:crypto";
import type { AvatarOverride } from "@/_schemas";
import {
  avatarExpressions,
  avatarOptions,
  getAvatarTypeForVoice,
  resolveAvatarSettings,
  type AvatarAppearance,
  type AvatarType,
} from "@/_schemas/catalog";
import { stableStringify } from "@/server/_shared/stable-stringify";
import { LLM_AVATAR_PROFILE } from "./profile";

/** The page default (what the avatar shows without a per-line override). */
export const DEFAULT_EXPRESSION = "default";

export type ExpressionField = keyof AvatarAppearance;

export const TURN_FIELDS = ["eyes", "mouth"] as const satisfies readonly ExpressionField[];

export type ExpressionLabels = Record<ExpressionField, string>;

export type VoiceLike = {
  provider?: string;
  voiceName?: string;
  speakerUuid?: string;
};

export function expressionChoices(type: AvatarType, field: ExpressionField): string[] {
  return Object.keys(avatarExpressions[type][field]);
}

export function hasTurnExpressions(type: AvatarType) {
  return TURN_FIELDS.some((field) => expressionChoices(type, field).length > 0);
}

/** `angry-opened` → `angry`; plain `opened` / `closed` are the default mouth. */
export function mouthFamily(mouth: string) {
  return /^(.+)-(?:opened|closed)$/u.exec(mouth)?.[1] ?? DEFAULT_EXPRESSION;
}

function toLabel(field: ExpressionField, value: string) {
  return field === "mouth" ? mouthFamily(value) : value;
}

/** Labels the auto-selectable part of an appearance; anything else reads as default. */
export function toExpressionLabels(
  type: AvatarType,
  appearance: AvatarAppearance,
): ExpressionLabels {
  const pick = (field: ExpressionField) => {
    const label = toLabel(field, appearance[field]);
    return expressionChoices(type, field).includes(label) ? label : DEFAULT_EXPRESSION;
  };
  return { base: pick("base"), eyes: pick("eyes"), mouth: pick("mouth") };
}

/** The value to store for a label; undefined drops the override. */
export function fromExpressionLabel(field: ExpressionField, label: string) {
  if (label === DEFAULT_EXPRESSION) {
    return undefined;
  }
  return field === "mouth" ? `${label}-opened` : label;
}

/**
 * Whether auto may replace a stored value: unset, unknown, the catalog default, or an option
 * with a meaning. Hand-picked props without one (masks, `mini`) stay.
 */
export function isAutoValue(type: AvatarType, field: ExpressionField, value: string | undefined) {
  if (!value || !(avatarOptions[type][field] as readonly string[]).includes(value)) {
    return true;
  }
  const label = toLabel(field, value);
  return (
    value === resolveAvatarSettings(type)[field] ||
    label === DEFAULT_EXPRESSION ||
    expressionChoices(type, field).includes(label)
  );
}

export type AvatarTurn<T> = { avatarType: AvatarType; items: T[] };

/** Consecutive lines of one avatar: it stays on screen between them (`createAvatarMotion`). */
export function groupAvatarTurns<T extends VoiceLike>(tts: readonly T[]): AvatarTurn<T>[] {
  const turns: AvatarTurn<T>[] = [];
  for (const item of tts) {
    const avatarType = getAvatarTypeForVoice(item);
    const last = turns.at(-1);
    if (last?.avatarType === avatarType) {
      last.items.push(item);
    } else {
      turns.push({ avatarType, items: [item] });
    }
  }
  return turns;
}

/** Drops fields equal to what the layer below already shows. */
export function minimizeOverride(
  override: AvatarOverride | undefined,
  inherited: AvatarAppearance,
): AvatarOverride | undefined {
  if (!override) {
    return undefined;
  }
  const entries = Object.entries(override).filter(
    ([field, value]) => value !== undefined && value !== inherited[field as ExpressionField],
  );
  return entries.length > 0 ? (Object.fromEntries(entries) as AvatarOverride) : undefined;
}

/** Changes when the turn's text, its avatar, the meanings or the profile change. */
export function expressionTurnKey(avatarType: AvatarType, lines: readonly string[]) {
  return crypto
    .createHash("md5")
    .update(
      stableStringify({
        profile: LLM_AVATAR_PROFILE.id,
        avatar: avatarType,
        meanings: avatarExpressions[avatarType],
        lines,
      }),
    )
    .digest("hex");
}
