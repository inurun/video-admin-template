import type { AvatarOverride } from "@/_schemas";
import {
  DEFAULT_VOICE_EMOTION,
  resolveAvatarSettings,
  type AvatarType,
  type VoiceEmotion,
} from "@/_schemas/catalog";
import {
  DEFAULT_EXPRESSION,
  expressionChoices,
  fromExpressionLabel,
  isAutoValue,
  minimizeOverride,
  TURN_FIELDS,
  type ExpressionField,
} from "./expression";

export type PageAvatars = Partial<Record<AvatarType, AvatarOverride>>;

export type ExpressionTurnItem = { id: string; avatar?: AvatarOverride };

export type ExpressionTurn<T extends ExpressionTurnItem = ExpressionTurnItem> = {
  id: string;
  avatarType: AvatarType;
  items: T[];
};

export type ExpressionPicks = {
  /** Omitted: page bases are left alone (the save-time job only owns eyes / mouth). */
  bases?: Partial<Record<AvatarType, string>>;
  /** `voices`: one per line of the turn; missing lines are neutral. */
  turns: Partial<Record<string, { eyes: string; mouth: string; voices?: VoiceEmotion[] }>>;
};

export type AppliedExpressions = {
  avatars: PageAvatars;
  /** `voiceEmotion` is left out for neutral. */
  tts: { id: string; avatar?: AvatarOverride; voiceEmotion?: VoiceEmotion }[];
};

function setField(
  override: AvatarOverride | undefined,
  field: ExpressionField,
  label: string,
): AvatarOverride {
  return { ...override, [field]: fromExpressionLabel(field, label) };
}

function applyBases(
  avatars: PageAvatars,
  avatarTypes: ReadonlySet<AvatarType>,
  picks: NonNullable<ExpressionPicks["bases"]>,
) {
  const next: PageAvatars = { ...avatars };
  for (const avatarType of avatarTypes) {
    if (expressionChoices(avatarType, "base").length === 0) {
      continue;
    }
    const current = next[avatarType];
    if (!isAutoValue(avatarType, "base", current?.base)) {
      continue;
    }
    const override = minimizeOverride(
      setField(current, "base", picks[avatarType] ?? DEFAULT_EXPRESSION),
      resolveAvatarSettings(avatarType),
    );
    if (override) {
      next[avatarType] = override;
    } else {
      delete next[avatarType];
    }
  }
  return next;
}

/**
 * Writes the picks into page defaults and each line of a turn, keeping only real differences.
 * Values auto may not own (masks, `mini`) stay.
 */
export function applyExpressions(input: {
  avatars: PageAvatars | undefined;
  turns: readonly ExpressionTurn[];
  picks: ExpressionPicks;
}): AppliedExpressions {
  const avatars = input.picks.bases
    ? applyBases(
        input.avatars ?? {},
        new Set(input.turns.map((turn) => turn.avatarType)),
        input.picks.bases,
      )
    : (input.avatars ?? {});

  const tts = input.turns.flatMap((turn) => {
    const pick = input.picks.turns[turn.id] ?? {
      eyes: DEFAULT_EXPRESSION,
      mouth: DEFAULT_EXPRESSION,
    };
    const inherited = resolveAvatarSettings(turn.avatarType, avatars[turn.avatarType]);
    return turn.items.map((item, index) => {
      const override = TURN_FIELDS.reduce<AvatarOverride | undefined>(
        (current, field) =>
          isAutoValue(turn.avatarType, field, current?.[field])
            ? setField(current, field, pick[field])
            : current,
        item.avatar,
      );
      const voice = pick.voices?.[index] ?? DEFAULT_VOICE_EMOTION;
      return {
        id: item.id,
        avatar: minimizeOverride(override, inherited),
        ...(voice === DEFAULT_VOICE_EMOTION ? {} : { voiceEmotion: voice }),
      };
    });
  });

  return { avatars, tts };
}
