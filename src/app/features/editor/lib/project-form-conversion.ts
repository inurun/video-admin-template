import {
  DEFAULT_VOICE_PRESETS,
  copyVoiceIdentity,
  toVoiceIdentity,
  type SavedPage,
  type SavedProject,
  type SavedSequenceItem,
  type SavedTts,
} from "@/_schemas";
import type { PageFormValues } from "@/app/features/page/model/page-form-schema";
import type { TransitionFormValues } from "@/app/features/page/model/transition-form-schema";
import type { ProjectSettingsFormValues } from "@/app/features/project/model/project-settings-form-schema";
import type { TtsFormValues } from "@/app/features/tts/model/tts-form-schema";
import { normalizeProjectMeta } from "@/app/features/project/lib/normalize-project-meta";
import { avatarOverridesEqual } from "@/app/features/tts/lib/avatar-override";

export function toTtsFormValues(item: SavedTts): TtsFormValues {
  const identity = toVoiceIdentity(item);
  return {
    id: item.id,
    text: item.text,
    readText: item.readText,
    padBeforeSec: item.padBeforeSec,
    padAfterSec: item.padAfterSec,
    volume: item.volume,
    ...(identity ? copyVoiceIdentity(identity) : { provider: item.provider, voiceName: "" }),
    ...(item.synthesisSettings ? { synthesisSettings: item.synthesisSettings } : {}),
    ...(item.avatar ? { avatar: item.avatar } : {}),
    ...(item.avatarSource ? { avatarSource: item.avatarSource } : {}),
    speech: item.speech.g2p ? { g2p: item.speech.g2p } : {},
  } as TtsFormValues;
}

export function toPageFormValues(page: SavedPage): PageFormValues {
  const tts = page.tts.map(toTtsFormValues);
  if (page.type === "outro") {
    return {
      id: page.id,
      title: page.title,
      type: "outro",
      meta: page.meta,
      padBeforeSec: page.padBeforeSec,
      padAfterSec: page.padAfterSec,
      richText: page.richText,
      tts,
    };
  }

  if (page.type === "endcard") {
    return {
      id: page.id,
      title: page.title,
      type: "endcard",
      meta: page.meta,
      padBeforeSec: page.padBeforeSec,
      padAfterSec: page.padAfterSec,
      richText: page.richText,
      tts,
    };
  }

  if (page.type === "comments") {
    return {
      id: page.id,
      title: page.title,
      type: "comments",
      meta: page.meta,
      comments: page.comments,
      commentGroups: page.commentGroups,
      commentScenes: page.commentScenes,
      padBeforeSec: page.padBeforeSec,
      padAfterSec: page.padAfterSec,
      richText: null,
      tts,
    };
  }

  return {
    id: page.id,
    title: page.title,
    type: page.type,
    meta: page.meta,
    padBeforeSec: page.padBeforeSec,
    padAfterSec: page.padAfterSec,
    richText: page.richText,
    tts,
  };
}

type AvatarFields = Pick<TtsFormValues, "avatar" | "avatarSource">;

function avatarFieldsEqual(left: AvatarFields | undefined, right: AvatarFields | undefined) {
  return (
    avatarOverridesEqual(left?.avatar, right?.avatar) &&
    JSON.stringify(left?.avatarSource ?? null) === JSON.stringify(right?.avatarSource ?? null)
  );
}

function withSavedAvatar(item: TtsFormValues, saved: AvatarFields): TtsFormValues {
  const { avatar: _avatar, avatarSource: _source, ...rest } = item;
  return {
    ...rest,
    ...(saved.avatar ? { avatar: saved.avatar } : {}),
    ...(saved.avatarSource ? { avatarSource: saved.avatarSource } : {}),
  } as TtsFormValues;
}

/** Server-owned tts fields: the g2p it generated and the expressions auto set. */
export function mergeSavedSpeechIntoPageForm(
  current: PageFormValues,
  savedFormPage: PageFormValues,
): PageFormValues {
  const savedById = new Map(savedFormPage.tts.map((item) => [item.id, item]));

  let changed = false;
  const tts = current.tts.map((item) => {
    const saved = savedById.get(item.id);
    if (!saved) {
      return item;
    }
    let next = item;
    const g2p = saved.speech?.g2p;
    if (g2p && item.speech?.g2p !== g2p) {
      next = { ...next, speech: { ...next.speech, g2p } };
    }
    if (item.avatarSource?.kind !== "manual" && !avatarFieldsEqual(item, saved)) {
      next = withSavedAvatar(next, saved);
    }
    changed ||= next !== item;
    return next;
  });

  return changed ? { ...current, tts } : current;
}

export function mergeUneditedSavedSpeechIntoPageForm(
  current: PageFormValues,
  previousSavedPage: SavedSequenceItem | undefined,
  nextSavedPage: SavedPage,
): PageFormValues {
  const previousTts: Map<string, SavedTts> =
    previousSavedPage && previousSavedPage.type !== "transition"
      ? new Map(previousSavedPage.tts.map((item) => [item.id, item]))
      : new Map();
  const nextById = new Map(nextSavedPage.tts.map((item) => [item.id, item]));

  let changed = false;
  const tts = current.tts.map((item) => {
    const saved = nextById.get(item.id);
    if (!saved) {
      return item;
    }
    const previous = previousTts.get(item.id);
    let next = item;

    const nextG2p = saved.speech.g2p;
    const currentKana = item.speech?.g2p?.kana;
    if (nextG2p && currentKana === previous?.speech.g2p?.kana && currentKana !== nextG2p.kana) {
      next = { ...next, speech: { ...next.speech, g2p: nextG2p } };
    }
    if (avatarFieldsEqual(item, previous) && !avatarFieldsEqual(item, saved)) {
      next = withSavedAvatar(next, saved);
    }

    changed ||= next !== item;
    return next;
  });

  return changed ? { ...current, tts } : current;
}

export function toSequenceFormItem(item: SavedProject["pages"][number]) {
  if (item.type === "transition") {
    return {
      id: item.id,
      type: "transition" as const,
      variant: item.variant,
    } satisfies TransitionFormValues;
  }

  return toPageFormValues(item);
}

export function toProjectSettingsFormValues(project: SavedProject): ProjectSettingsFormValues {
  return {
    meta: normalizeProjectMeta(project.meta),
    bgm: project.bgm,
    voicePresets: project.voicePresets ?? DEFAULT_VOICE_PRESETS,
  };
}
