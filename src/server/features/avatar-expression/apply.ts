import type { AvatarOverride } from "@/_schemas";
import { resolveAvatarSettings, type AvatarType } from "@/_schemas/catalog";
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
  turns: Partial<Record<string, { eyes: string; mouth: string }>>;
};

export type AppliedExpressions = {
  avatars: PageAvatars;
  tts: { id: string; avatar?: AvatarOverride }[];
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
    return turn.items.map((item) => {
      const override = TURN_FIELDS.reduce<AvatarOverride | undefined>(
        (current, field) =>
          isAutoValue(turn.avatarType, field, current?.[field])
            ? setField(current, field, pick[field])
            : current,
        item.avatar,
      );
      return { id: item.id, avatar: minimizeOverride(override, inherited) };
    });
  });

  return { avatars, tts };
}
