import type { AvatarOverride, AvatarSource } from "@/_schemas";
import {
  expressionTurnKey,
  groupAvatarTurns,
  hasTurnExpressions,
  TURN_FIELDS,
  type VoiceLike,
} from "./expression";

type AvatarFields = { avatar?: AvatarOverride; avatarSource?: AvatarSource };

type PlannedTts = VoiceLike & AvatarFields & { id: string; text: string };

function sourceKey(source: AvatarSource | undefined) {
  return source && "key" in source ? source.key : undefined;
}

/** Lines saved before auto existed count as hand-set when they hold eyes / mouth. */
export function isAutoOwned(item: AvatarFields) {
  if (!item.avatarSource) {
    return !TURN_FIELDS.some((field) => item.avatar?.[field] !== undefined);
  }
  return item.avatarSource.kind !== "manual";
}

/**
 * Sources other than manual only ever come from the server, so the one on disk is newer, unless
 * the client holds an auto result for the current text (the Auto expression button).
 */
export function resolveSavedAvatar<T extends AvatarFields>(
  item: T,
  previous: AvatarFields | undefined,
  key: string,
): T {
  if (
    item.avatarSource?.kind === "manual" ||
    !previous?.avatarSource ||
    previous.avatarSource.kind === "manual"
  ) {
    return item;
  }
  if (item.avatarSource?.kind === "auto" && item.avatarSource.key === key) {
    return item;
  }
  const { avatar: _avatar, avatarSource: _source, ...rest } = item;
  return {
    ...rest,
    ...(previous.avatar ? { avatar: previous.avatar } : {}),
    avatarSource: previous.avatarSource,
  } as T;
}

function withSource<T extends AvatarFields>(item: T, avatarSource: AvatarSource): T {
  return { ...item, avatarSource };
}

/**
 * Marks auto-owned turns whose text changed as pending. Returns the keys to run; a pending turn
 * whose job is still running is left as it is.
 */
export function planPageExpressions<T extends PlannedTts>(
  tts: readonly T[],
  previousById: ReadonlyMap<string, AvatarFields>,
  options: { enabled: boolean; isInFlight: (key: string) => boolean },
): { tts: T[]; keys: string[] } {
  const keys: string[] = [];
  const next = groupAvatarTurns(tts).flatMap((turn) => {
    if (!hasTurnExpressions(turn.avatarType)) {
      return turn.items;
    }
    const key = expressionTurnKey(
      turn.avatarType,
      turn.items.map((item) => item.text),
    );
    const items = turn.items.map((item) =>
      resolveSavedAvatar(item, previousById.get(item.id), key),
    );
    if (!items.every(isAutoOwned)) {
      return items;
    }

    const kinds = new Set(
      items.map((item) =>
        sourceKey(item.avatarSource) === key ? item.avatarSource!.kind : undefined,
      ),
    );
    if (kinds.size === 1 && (kinds.has("auto") || kinds.has("failed"))) {
      return items;
    }
    if (!options.enabled) {
      // No LLM: a pending turn would keep the editor polling forever.
      return items.map((item) =>
        item.avatarSource?.kind === "pending"
          ? withSource(item, { kind: "failed", key: item.avatarSource.key })
          : item,
      );
    }
    if (!(kinds.size === 1 && kinds.has("pending") && options.isInFlight(key))) {
      keys.push(key);
    }
    return items.map((item) => withSource(item, { kind: "pending", key }));
  });
  return { tts: next, keys };
}
