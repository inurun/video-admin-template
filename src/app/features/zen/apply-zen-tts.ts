import type { TtsFormValues } from "@/app/features/tts/model/tts-form-schema";
import { getVoiceId, toVoiceIdentity, voiceIdentitiesEqual } from "@/_schemas";
import { applyTtsTextChange } from "@/app/features/tts/lib/apply-tts-text-change";
import { applyTtsVoiceChange } from "@/app/features/tts/lib/apply-tts-voice-change";
import { avatarOverridesEqual, toAvatarOverride } from "@/app/features/tts/lib/avatar-override";
import { createVoiceAliasMap } from "@/app/features/zen/create-alias-map";
import type { ZenAliasTarget } from "@/app/features/zen/types";

function ttsAlias(item: TtsFormValues, voiceAliases: Map<string, string>) {
  const identity = toVoiceIdentity(item);
  return (identity ? voiceAliases.get(getVoiceId(identity)) : undefined) ?? "";
}

function isSameTtsKey(
  left: TtsFormValues,
  right: TtsFormValues,
  voiceAliases: Map<string, string>,
) {
  return ttsAlias(left, voiceAliases) === ttsAlias(right, voiceAliases) && left.text === right.text;
}

function applyAvatar(existing: TtsFormValues, next: TtsFormValues): TtsFormValues {
  if (avatarOverridesEqual(existing.avatar, next.avatar)) return existing;
  const { avatar: _avatar, ...rest } = existing;
  const avatar = toAvatarOverride(next.avatar);
  return avatar ? { ...rest, avatar } : rest;
}

function applySubstitute(existing: TtsFormValues, next: TtsFormValues): TtsFormValues {
  let result = existing;
  const existingIdentity = toVoiceIdentity(existing);
  const nextIdentity = toVoiceIdentity(next);
  const voiceChanged =
    !existingIdentity || !nextIdentity || !voiceIdentitiesEqual(existingIdentity, nextIdentity);

  if (voiceChanged && nextIdentity && next.provider !== "coeiroink") {
    result = applyTtsVoiceChange(result, {
      provider: next.provider,
      voiceName: next.voiceName ?? "",
      voiceVersion: next.voiceVersion ?? "",
      displayName: next.voiceName ?? "",
    });
  } else if (voiceChanged && next.provider === "coeiroink") {
    result = applyTtsVoiceChange(result, {
      provider: "coeiroink",
      speakerUuid: next.speakerUuid,
      styleId: next.styleId,
      modelVersion: next.modelVersion,
      displayName: "",
      speakerName: "",
      styleName: "",
    });
  }

  if (result.text !== next.text) {
    result = applyTtsTextChange(result, next.text);
  }

  return applyAvatar(result, next);
}

export function applyZenTtsList(
  existing: TtsFormValues[],
  next: TtsFormValues[],
  aliases: Map<string, ZenAliasTarget>,
): TtsFormValues[] {
  const voiceAliases = createVoiceAliasMap(aliases);
  const usedOld = new Set<number>();
  const matchForNew: Array<number | null> = next.map(() => null);

  for (const [newIndex, incoming] of next.entries()) {
    const found = existing.findIndex(
      (item, oldIndex) => !usedOld.has(oldIndex) && isSameTtsKey(item, incoming, voiceAliases),
    );
    if (found < 0) {
      continue;
    }

    matchForNew[newIndex] = found;
    usedOld.add(found);
  }

  const unmatchedOld = existing
    .map((_, oldIndex) => oldIndex)
    .filter((oldIndex) => !usedOld.has(oldIndex));
  const unmatchedNew = matchForNew.flatMap((matched, newIndex) =>
    matched === null ? [newIndex] : [],
  );
  const substituteForNew = new Map<number, number>();
  const zipCount = Math.min(unmatchedOld.length, unmatchedNew.length);

  for (let offset = 0; offset < zipCount; offset += 1) {
    const newIndex = unmatchedNew[offset];
    const oldIndex = unmatchedOld[offset];
    if (newIndex === undefined || oldIndex === undefined) {
      continue;
    }
    substituteForNew.set(newIndex, oldIndex);
  }

  const result: TtsFormValues[] = [];
  for (const [newIndex, incoming] of next.entries()) {
    const matchedOldIndex = matchForNew[newIndex];
    if (matchedOldIndex !== null && matchedOldIndex !== undefined) {
      const current = existing[matchedOldIndex];
      if (current) {
        result.push(applyAvatar(current, incoming));
      }
      continue;
    }

    const substitutedOldIndex = substituteForNew.get(newIndex);
    if (substitutedOldIndex !== undefined) {
      const current = existing[substitutedOldIndex];
      if (current) {
        result.push(applySubstitute(current, incoming));
      }
      continue;
    }

    result.push(incoming);
  }

  return result;
}
