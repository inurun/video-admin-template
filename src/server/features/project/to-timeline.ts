import type {
  BgmTrack,
  SavedCommentsPage,
  SavedPage,
  SavedProject,
  SavedSequenceItem,
  SavedTimeline,
  SavedTimelineClip,
  SavedTts,
  TransitionVariant,
} from "@/_schemas";
import type { BgmScene } from "@/video-host/contract";
import { BGM_TRACK_ID, SEQUENCE_TRACK_ID, savedTimelineSchema } from "@/_schemas";
import { listPlaybackCommentGroups } from "@/server/features/project/comments-presentation";
import {
  ENDCARD_DURATION_SEC,
  EYECATCH_TEXT_MIN_DURATION_SEC,
  MIN_TTS_DURATION_SECONDS,
  OUTRO_BLOCKS_PER_PAGE,
  OUTRO_CARDS_DELAY_SEC,
  OUTRO_PAGE_DURATION_SEC,
  OUTRO_PAPER_FADE_OUT_SEC,
  OUTRO_PAPER_HOLD_AFTER_PAGE_SEC,
  TRANSITION_DURATION_SEC,
} from "@/constants";

function isContentPage(item: SavedSequenceItem): item is SavedPage {
  return item.type !== "transition";
}

function ttsIsUnresolved(tts: SavedTts) {
  return (
    tts.audio.status === "analyzing" ||
    tts.audio.status === "pending" ||
    tts.audio.status === "failed"
  );
}

function pageHasUnresolvedTts(page: SavedPage) {
  return page.tts.some(ttsIsUnresolved);
}

function transitionDurationSec(variant: TransitionVariant) {
  return TRANSITION_DURATION_SEC[variant];
}

function nestedEndSec(clips: SavedTimelineClip[]) {
  return clips.reduce((endSec, clip) => Math.max(endSec, clip.startSec + clip.durationSec), 0);
}

function createOutroVisualClips(blockCount: number): SavedTimelineClip[] {
  const pageCount = Math.ceil(blockCount / OUTRO_BLOCKS_PER_PAGE);
  return Array.from({ length: pageCount }, (_, index) => ({
    id: `outro-page-${index}`,
    startSec: OUTRO_CARDS_DELAY_SEC + index * OUTRO_PAGE_DURATION_SEC,
    durationSec: OUTRO_PAGE_DURATION_SEC,
    clips: [],
  }));
}

function createEndcardVisualClips(advertiserCount: number): SavedTimelineClip[] {
  const pageCount = Math.max(1, advertiserCount);
  const step = ENDCARD_DURATION_SEC - TRANSITION_DURATION_SEC.slide;
  return Array.from({ length: pageCount }, (_, index) => ({
    id: `endcard-page-${index}`,
    startSec: index * step,
    durationSec: ENDCARD_DURATION_SEC,
    clips: [],
  }));
}

function createVisualClips(page: SavedPage): SavedTimelineClip[] {
  if (page.type === "outro") {
    return createOutroVisualClips(page.meta.blocks.length);
  }
  if (page.type === "endcard") {
    return createEndcardVisualClips(page.meta.advertisers.length);
  }
  return [];
}

function createTtsClips(page: SavedPage, readyOnly: boolean) {
  const clips: SavedTimelineClip[] = [];
  let cursor = 0;

  for (const tts of page.tts) {
    const ready = tts.audio.status === "ready";
    if (readyOnly && !ready) {
      continue;
    }

    const audioDurationSec = tts.audio.status === "ready" ? tts.audio.durationSec : 0;
    const startSec = cursor + tts.padBeforeSec;
    const durationSec = Math.max(MIN_TTS_DURATION_SECONDS, audioDurationSec + tts.padAfterSec);
    clips.push({
      id: tts.id,
      startSec: page.padBeforeSec + startSec,
      durationSec,
      clips: [],
    });
    cursor = startSec + durationSec;
  }

  return { clips, ttsEndSec: cursor };
}

function pushUniqueClip(clips: SavedTimelineClip[], clip: SavedTimelineClip) {
  if (clips.some((item) => item.id === clip.id)) {
    throw new Error(`duplicate clip id ${clip.id}`);
  }
  clips.push(clip);
}

function commentsTtsClip(
  tts: SavedTts,
  cursor: number,
): { clip: SavedTimelineClip; nextCursor: number } {
  const padBeforeSec = Math.max(0, tts.padBeforeSec);
  const padAfterSec = Math.max(0, tts.padAfterSec);
  const audioDurationSec = tts.audio.status === "ready" ? tts.audio.durationSec : 0;
  const startSec = cursor + padBeforeSec;
  const durationSec = Math.max(MIN_TTS_DURATION_SECONDS, audioDurationSec + padAfterSec);
  return {
    clip: { id: tts.id, startSec, durationSec, clips: [] },
    nextCursor: startSec + durationSec,
  };
}

function createCommentsTimeline(page: SavedCommentsPage) {
  const ttsById = new Map(page.tts.map((item) => [item.id, item]));
  const clips: SavedTimelineClip[] = [];
  let visualEnd = 0;
  let isFirstVisible = true;

  for (const group of listPlaybackCommentGroups(
    page.commentGroups,
    page.commentScenes,
    page.meta.presentation,
    new Set(ttsById.keys()),
  )) {
    const ttsIds = group.ttsIds.filter((ttsId) => ttsById.has(ttsId));
    if (ttsIds.length === 0) {
      continue;
    }

    const audioStart = isFirstVisible ? page.padBeforeSec : visualEnd;
    const visualStart = isFirstVisible ? 0 : visualEnd;
    isFirstVisible = false;
    let audioCursor = audioStart;

    for (const ttsId of ttsIds) {
      const tts = ttsById.get(ttsId);
      if (!tts) {
        continue;
      }
      const { clip, nextCursor } = commentsTtsClip(tts, audioCursor);
      pushUniqueClip(clips, clip);
      audioCursor = nextCursor;
    }

    visualEnd = audioCursor;
    pushUniqueClip(clips, {
      id: group.id,
      startSec: visualStart,
      durationSec: visualEnd - visualStart,
      clips: [],
    });
  }

  const durationSec =
    clips.length === 0
      ? Math.max(MIN_TTS_DURATION_SECONDS, page.padBeforeSec + page.padAfterSec)
      : visualEnd + page.padAfterSec;

  return { clips, durationSec };
}

function createPageClips(page: SavedPage) {
  if (page.type === "comments") {
    return createCommentsTimeline(page).clips;
  }
  return [...createTtsClips(page, false).clips, ...createVisualClips(page)];
}

function getOutroHoldFadeSec() {
  return OUTRO_PAPER_HOLD_AFTER_PAGE_SEC + OUTRO_PAPER_FADE_OUT_SEC;
}

function getReadyPageDurationSec(page: SavedPage) {
  const visualClips = createVisualClips(page);
  const visualEndSec = nestedEndSec(visualClips);

  if (page.type === "outro") {
    const contentSec = visualClips.length === 0 ? 0 : visualEndSec + getOutroHoldFadeSec();
    return Math.max(
      MIN_TTS_DURATION_SECONDS,
      contentSec + page.padBeforeSec + page.padAfterSec,
      visualEndSec,
    );
  }

  if (page.type === "endcard") {
    return Math.max(
      MIN_TTS_DURATION_SECONDS,
      visualEndSec + page.padBeforeSec + page.padAfterSec,
      visualEndSec,
    );
  }

  if (page.type === "comments") {
    return Math.max(MIN_TTS_DURATION_SECONDS, createCommentsTimeline(page).durationSec);
  }

  const { ttsEndSec } = createTtsClips(page, true);

  if (page.type === "eyecatch-text") {
    return Math.max(EYECATCH_TEXT_MIN_DURATION_SEC, ttsEndSec);
  }

  return Math.max(MIN_TTS_DURATION_SECONDS, ttsEndSec + page.padBeforeSec + page.padAfterSec);
}

function getProvisionalPageDurationSec(page: SavedPage, adjacentTransitionSec: number) {
  if (page.type === "outro" || page.type === "endcard") {
    return Math.max(getReadyPageDurationSec(page), adjacentTransitionSec);
  }

  if (page.type === "eyecatch-text") {
    return Math.max(EYECATCH_TEXT_MIN_DURATION_SEC, adjacentTransitionSec);
  }

  return Math.max(
    MIN_TTS_DURATION_SECONDS,
    page.padBeforeSec + page.padAfterSec,
    adjacentTransitionSec,
  );
}

function getAdjacentTransitionSec(pages: SavedSequenceItem[], index: number) {
  let adjacentSec = 0;
  const previous = pages[index - 1];
  const next = pages[index + 1];
  if (previous && previous.type === "transition") {
    adjacentSec = Math.max(adjacentSec, transitionDurationSec(previous.variant));
  }
  if (next && next.type === "transition") {
    adjacentSec = Math.max(adjacentSec, transitionDurationSec(next.variant));
  }
  return adjacentSec;
}

function sequenceClips(timeline: SavedTimeline | undefined) {
  return timeline?.tracks.find((track) => track.id === SEQUENCE_TRACK_ID)?.clips ?? [];
}

function getPageDurationSec(input: {
  page: SavedPage;
  index: number;
  pages: SavedSequenceItem[];
  previousById: Map<string, SavedTimelineClip>;
}) {
  const adjacentTransitionSec = getAdjacentTransitionSec(input.pages, input.index);

  if (input.page.type === "comments") {
    return Math.max(getReadyPageDurationSec(input.page), adjacentTransitionSec);
  }

  if (pageHasUnresolvedTts(input.page)) {
    const previous = input.previousById.get(input.page.id);
    if (previous) {
      return Math.max(previous.durationSec, adjacentTransitionSec);
    }
    return getProvisionalPageDurationSec(input.page, adjacentTransitionSec);
  }

  return Math.max(getReadyPageDurationSec(input.page), adjacentTransitionSec);
}

/** BGM file name → measured length in seconds. */
export type BgmDurations = Record<string, number>;

/** Plays of a file over a span: back to back when it loops, else once. */
function createPlays(id: string, durationSec: number, fileSec: number, loop: boolean) {
  const playCount = durationSec === 0 ? 0 : loop ? Math.ceil(durationSec / fileSec - 1e-9) : 1;
  return Array.from({ length: playCount }, (_, play) => ({
    id: `${id}-${play}`,
    startSec: play * fileSec,
    durationSec: Math.min(fileSec, durationSec - play * fileSec),
    clips: [],
  }));
}

/**
 * Loops to the video end when `endSec` is null, else plays once until `endSec`. Each play of
 * the file is a nested clip; an unmeasured file plays once over the whole span.
 */
function createBgmClip(
  track: BgmTrack,
  index: number,
  videoDurationSec: number,
  bgmDurations: BgmDurations,
): SavedTimelineClip {
  const startSec = track.startSec ?? 0;
  const durationSec = Math.max(0, (track.endSec ?? videoDurationSec) - startSec);
  const measured = bgmDurations[track.src];
  const fileSec = measured !== undefined && measured > 0 ? measured : durationSec;
  const id = `bgm-${index}`;
  return {
    id,
    startSec,
    durationSec,
    clips: createPlays(id, durationSec, fileSec, track.endSec === null),
  };
}

/**
 * Scene music: one `bgm-scene-{scene}-{n}` clip per page clip nesting a clip with the scene's
 * id, spanning it and looping the file inside.
 */
function createSceneBgmClips(
  pageClips: readonly SavedTimelineClip[],
  scenes: readonly BgmScene[],
  bgmDurations: BgmDurations,
): SavedTimelineClip[] {
  return scenes.flatMap((scene, sceneIndex) =>
    pageClips
      .flatMap((pageClip) =>
        pageClip.clips
          .filter((clip) => clip.id === scene.clip)
          .map((clip) => ({
            startSec: pageClip.startSec + clip.startSec,
            durationSec: clip.durationSec,
          })),
      )
      .map((span, index) => {
        const id = `bgm-scene-${sceneIndex}-${index}`;
        const measured = bgmDurations[scene.src];
        const fileSec = measured !== undefined && measured > 0 ? measured : span.durationSec;
        return { id, ...span, clips: createPlays(id, span.durationSec, fileSec, true) };
      }),
  );
}

export function toTimeline(
  project: SavedProject,
  previous?: SavedTimeline,
  bgmDurations: BgmDurations = {},
  scenes: readonly BgmScene[] = [],
): SavedTimeline {
  const previousById = new Map(sequenceClips(previous).map((clip) => [clip.id, clip]));
  const clips: SavedTimelineClip[] = [];
  let pageDurSum = 0;
  let transitionDurSum = 0;

  for (const [index, item] of project.pages.entries()) {
    if (isContentPage(item)) {
      const durationSec = getPageDurationSec({
        page: item,
        index,
        pages: project.pages,
        previousById,
      });
      const startSec = pageDurSum - transitionDurSum;
      clips.push({
        id: item.id,
        startSec,
        durationSec,
        clips: createPageClips(item),
      });
      pageDurSum += durationSec;
      continue;
    }

    const durationSec = transitionDurationSec(item.variant);
    const cutSec = pageDurSum - transitionDurSum;
    clips.push({
      id: item.id,
      startSec: cutSec - durationSec,
      durationSec,
      clips: [],
    });
    transitionDurSum += durationSec;
  }

  const durationSec = Math.max(0, pageDurSum - transitionDurSum);
  const bgmClips = [
    ...project.bgm.map((track, index) => createBgmClip(track, index, durationSec, bgmDurations)),
    ...createSceneBgmClips(clips, scenes, bgmDurations),
  ];
  return savedTimelineSchema.parse({
    durationSec,
    tracks: [
      { id: SEQUENCE_TRACK_ID, clips },
      ...(bgmClips.length > 0 ? [{ id: BGM_TRACK_ID, clips: bgmClips }] : []),
    ],
  });
}
