import { SEQUENCE_TRACK_ID, type SavedTimeline, type SavedTimelineClip } from "@/_schemas";

export function getSequenceClips(timeline: SavedTimeline): SavedTimelineClip[] {
  return timeline.tracks.find((track) => track.id === SEQUENCE_TRACK_ID)?.clips ?? [];
}

export function getPageClip(
  timeline: SavedTimeline,
  pageId: string,
): SavedTimelineClip | undefined {
  return getSequenceClips(timeline).find((clip) => clip.id === pageId);
}

/** Every sequence-track clip at any depth, with its start in timeline seconds, parents first. */
export function flattenSequenceClips(
  timeline: SavedTimeline,
): { clip: SavedTimelineClip; startSec: number }[] {
  const walk = (
    clips: readonly SavedTimelineClip[],
    offsetSec: number,
  ): { clip: SavedTimelineClip; startSec: number }[] =>
    clips.flatMap((clip) => {
      const startSec = offsetSec + clip.startSec;
      return [{ clip, startSec }, ...walk(clip.clips, startSec)];
    });
  return walk(getSequenceClips(timeline), 0);
}
