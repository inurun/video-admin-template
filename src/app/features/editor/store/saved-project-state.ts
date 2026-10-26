import {
  type SavedProject,
  type SavedProjectSettings,
  type SavedSequenceItem,
  type SavedTimeline,
} from "@/_schemas";
import { EMPTY_TIMELINE, SEQUENCE_TRACK_ID } from "@/_schemas";

export type SavedProjectState = {
  project: SavedProjectSettings;
  timeline: SavedTimeline;
  sequenceOrder: string[];
  itemsById: Record<string, SavedSequenceItem>;
  itemRevision: Record<string, number>;
  renderRevision: number;
  syncGeneration: number;
};

export type SaveProjectResult = {
  project: SavedProject;
  timeline: SavedTimeline;
  updatedItemIds: string[];
};

function toSettings(project: SavedProject): SavedProjectSettings {
  return {
    meta: project.meta,
    bgm: project.bgm,
    voicePresets: project.voicePresets,
  };
}

function toItemsById(project: SavedProject) {
  return Object.fromEntries(project.pages.map((item) => [item.id, item]));
}

export function createSavedProjectState(
  project: SavedProject,
  timeline: SavedTimeline = EMPTY_TIMELINE,
  syncGeneration = 0,
): SavedProjectState {
  const itemsById = toItemsById(project);
  return {
    project: toSettings(project),
    timeline,
    sequenceOrder: project.pages.map((item) => item.id),
    itemsById,
    itemRevision: Object.fromEntries(Object.keys(itemsById).map((itemId) => [itemId, 0])),
    renderRevision: 0,
    syncGeneration,
  };
}

export function reconstructSavedProject(state: SavedProjectState): SavedProject {
  return {
    meta: state.project.meta,
    bgm: state.project.bgm,
    voicePresets: state.project.voicePresets,
    pages: state.sequenceOrder.flatMap((itemId) => {
      const item = state.itemsById[itemId];
      return item ? [item] : [];
    }),
  };
}

function getItemPreviewSignature(
  item: SavedSequenceItem | undefined,
  itemId: string,
  timeline: SavedTimeline,
) {
  if (!item) {
    return itemId;
  }
  if (item.type === "transition") {
    return `${itemId}:transition:${item.variant}`;
  }
  const ttsSignature = item.tts
    .map((tts) => {
      if (tts.audio.status === "ready") {
        return `${tts.id}:ready:${tts.audio.src}:${tts.audio.durationSec}`;
      }
      if (tts.audio.status === "failed") {
        return `${tts.id}:failed:${tts.audio.src}:${tts.audio.error}`;
      }
      return `${tts.id}:processing`;
    })
    .join("|");
  const durationSec =
    timeline.tracks
      .find((track) => track.id === SEQUENCE_TRACK_ID)
      ?.clips.find((clip) => clip.id === itemId)?.durationSec ?? 0;
  return `${itemId}:${durationSec}:${item.padBeforeSec}:${item.padAfterSec}:${ttsSignature}`;
}

function affectsAllRenders(previous: SavedProjectState, next: SavedProjectState) {
  if (
    previous.project.meta.width !== next.project.meta.width ||
    previous.project.meta.height !== next.project.meta.height ||
    previous.sequenceOrder.join("\0") !== next.sequenceOrder.join("\0")
  ) {
    return true;
  }

  return previous.sequenceOrder.some((itemId) => {
    return (
      getItemPreviewSignature(previous.itemsById[itemId], itemId, previous.timeline) !==
      getItemPreviewSignature(next.itemsById[itemId], itemId, next.timeline)
    );
  });
}

export function applySavedProjectHydrate(
  state: SavedProjectState,
  project: SavedProject,
  timeline: SavedTimeline = EMPTY_TIMELINE,
): SavedProjectState {
  return createSavedProjectState(project, timeline, state.syncGeneration + 1);
}

export function applySavedProjectSaveResult(
  state: SavedProjectState,
  result: SaveProjectResult,
): SavedProjectState {
  const next = createSavedProjectState(result.project, result.timeline, state.syncGeneration + 1);
  const nextItemRevision = { ...next.itemRevision };

  for (const itemId of Object.keys(nextItemRevision)) {
    const previousRevision = state.itemRevision[itemId] ?? 0;
    nextItemRevision[itemId] = result.updatedItemIds.includes(itemId)
      ? previousRevision + 1
      : previousRevision;
  }

  return {
    ...next,
    itemRevision: nextItemRevision,
    renderRevision: affectsAllRenders(state, next)
      ? state.renderRevision + 1
      : state.renderRevision,
  };
}

export function applySavedProjectExternalUpdate(
  state: SavedProjectState,
  project: SavedProject,
  timeline: SavedTimeline = EMPTY_TIMELINE,
): SavedProjectState {
  const next = createSavedProjectState(project, timeline, state.syncGeneration + 1);
  const nextItemRevision = { ...next.itemRevision };
  const itemIds = new Set([...Object.keys(state.itemRevision), ...Object.keys(nextItemRevision)]);

  for (const itemId of itemIds) {
    const previousRevision = state.itemRevision[itemId] ?? 0;
    if (!(itemId in nextItemRevision)) {
      continue;
    }
    const changed =
      getItemPreviewSignature(state.itemsById[itemId], itemId, state.timeline) !==
      getItemPreviewSignature(next.itemsById[itemId], itemId, next.timeline);
    nextItemRevision[itemId] = changed ? previousRevision + 1 : previousRevision;
  }

  return {
    ...next,
    itemRevision: nextItemRevision,
    renderRevision: affectsAllRenders(state, next)
      ? state.renderRevision + 1
      : state.renderRevision,
  };
}

export function selectHasUnresolvedAudio(state: SavedProjectState) {
  return Object.values(state.itemsById).some(
    (item) =>
      item.type !== "transition" &&
      item.tts.some((tts) => tts.audio.status === "analyzing" || tts.audio.status === "pending"),
  );
}

export function selectHasPendingExpressions(state: SavedProjectState) {
  return Object.values(state.itemsById).some(
    (item) =>
      item.type !== "transition" && item.tts.some((tts) => tts.avatarSource?.kind === "pending"),
  );
}

/** Server work the editor waits for: audio and auto expressions. */
export function selectHasBackgroundWork(state: SavedProjectState) {
  return selectHasUnresolvedAudio(state) || selectHasPendingExpressions(state);
}

export function selectFailedTtsItemIds(state: Pick<SavedProjectState, "itemsById">) {
  return Object.values(state.itemsById).flatMap((item) => {
    if (item.type === "transition") {
      return [];
    }
    return item.tts.some((tts) => tts.audio.status === "failed") ? [item.id] : [];
  });
}
