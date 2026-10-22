// Every sound the video plays, as data. Static <audio> is the only audio HF render detects,
// so the server and the preview entry both build it from this list.
// Imports stay DOM-free: the server builds the HTML from this module.
import {
  BGM_TRACK_ID,
  type BgmTrack,
  type SavedProject,
  type SavedTimeline,
  type SavedTimelineClip,
} from "@/_schemas";
import { staticFile } from "../static-file";
import type { VideoAudioConfig } from "../contract";
import { secondsRangeToFrames, secondsToFrames } from "../frame-utils";
import { getSequenceClips } from "../sequence-clips";
import { collectDuckableIntervals } from "./ducking/collect-duckable-intervals";
import { computeDuckAmount } from "./ducking/compute-duck-amount";
import { computeFadeFactor } from "./ducking/compute-fade-factor";

export type AudioVolumePoint = { t: number; v: number };

export type AudioClip = {
  id: string;
  src: string;
  startSec: number;
  durationSec: number;
  /** Media offset when the page starts after the TTS clip. */
  mediaStartSec?: number;
  /** Constant gain, or a volume lane in clip-local seconds. */
  volume: number | AudioVolumePoint[];
};

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

/** Frames `[from, to)` of a seconds range. */
function toFrames(startSec: number, durationSec: number, fps: number) {
  const { start, duration } = secondsRangeToFrames(startSec, durationSec, fps);
  return { from: start, to: start + duration };
}

/**
 * Placed from the timeline's absolute seconds. The composition nests the TTS `Clip` in the
 * page `Clip`, which snaps the page start to a frame first, so a clip can land ±1 frame from
 * the on-screen TTS timing.
 */
function collectTtsClips(
  project: SavedProject,
  timeline: SavedTimeline,
  totalFrames: number,
  fps: number,
  ttsPageTypes: VideoAudioConfig["ttsPageTypes"],
): AudioClip[] {
  const pagesById = new Map(project.pages.map((page) => [page.id, page]));
  return getSequenceClips(timeline).flatMap((pageClip) => {
    const page = pagesById.get(pageClip.id);
    if (!page || page.type === "transition" || !ttsPageTypes.includes(page.type)) {
      return [];
    }
    const pageFrames = toFrames(pageClip.startSec, pageClip.durationSec, fps);
    const ttsById = new Map(page.tts.map((tts) => [tts.id, tts]));
    return pageClip.clips.flatMap((clip) => {
      const tts = ttsById.get(clip.id);
      if (!tts || tts.audio.status !== "ready" || tts.audio.src.trim() === "") {
        return [];
      }
      const audio = toFrames(pageClip.startSec + clip.startSec, clip.durationSec, fps);
      const from = Math.max(audio.from, pageFrames.from, 0);
      const to = Math.min(audio.to, pageFrames.to, totalFrames);
      if (to <= from) {
        return [];
      }
      return [
        {
          id: `tts-${page.id}-${tts.id}`,
          src: staticFile(tts.audio.src),
          startSec: from / fps,
          durationSec: (to - from) / fps,
          ...(from > audio.from ? { mediaStartSec: (from - audio.from) / fps } : {}),
          volume: tts.volume,
        },
      ];
    });
  });
}

/**
 * One point per frame, minus points on a straight line between their neighbours.
 * A flat curve collapses to a constant gain.
 */
export function sampleVolume(
  volume: (localFrame: number) => number,
  frameCount: number,
  fps: number,
): number | AudioVolumePoint[] {
  const values = Array.from({ length: frameCount }, (_, index) => volume(index));
  const first = values[0] ?? 0;
  if (values.every((value) => value === first)) {
    return first;
  }
  return values.flatMap((v, index) => {
    const prev = values[index - 1];
    const next = values[index + 1];
    const collinear =
      prev !== undefined && next !== undefined && Math.abs(prev + next - 2 * v) < 1e-9;
    return collinear ? [] : [{ t: round6(index / fps), v: round6(v) }];
  });
}

/** Clip-local volume for each play of a track clip, cut to the video and the track span. */
function collectPlays(
  trackClip: SavedTimelineClip,
  src: string,
  totalFrames: number,
  fps: number,
  volumeAt: (trackFrame: number) => number,
): AudioClip[] {
  const startFrame = secondsToFrames(trackClip.startSec, fps);
  const endFrame = secondsToFrames(trackClip.startSec + trackClip.durationSec, fps);
  return trackClip.clips.flatMap((play) => {
    const frames = toFrames(trackClip.startSec + play.startSec, play.durationSec, fps);
    const from = Math.max(frames.from, 0);
    const to = Math.min(frames.to, endFrame, totalFrames);
    if (to <= from) {
      return [];
    }
    return [
      {
        id: play.id,
        src,
        startSec: from / fps,
        durationSec: (to - from) / fps,
        ...(from > frames.from ? { mediaStartSec: (from - frames.from) / fps } : {}),
        volume: sampleVolume((frame) => volumeAt(from - startFrame + frame), to - from, fps),
      },
    ];
  });
}

/**
 * BGM: one clip per play of the file from the timeline's `bgm` track, so a loop never depends
 * on the player wrapping media. Fades and ducks per frame over the whole track span: each play
 * samples its own slice of that curve. Scene music (`bgm-scene-*`) crossfades in for its span
 * while the project tracks fade out under it.
 */
function collectBgmClips(
  project: SavedProject,
  timeline: SavedTimeline,
  totalFrames: number,
  fps: number,
  { fadeSec, duck, scenes }: VideoAudioConfig["bgm"],
): AudioClip[] {
  const duckableIntervals = collectDuckableIntervals(project, timeline, fps);
  const fadeFrames = Math.round(fadeSec * fps);
  const duckAt = (frame: number) =>
    computeDuckAmount(
      frame,
      duckableIntervals,
      Math.round(duck.holdSec * fps),
      Math.round(duck.downSec * fps),
      Math.round(duck.releaseSec * fps),
      duck.drop,
    );
  const bgmClips = timeline.tracks.find((track) => track.id === BGM_TRACK_ID)?.clips ?? [];
  const spanFrames = (clip: SavedTimelineClip) => {
    const start = secondsToFrames(clip.startSec, fps);
    // Fades span the clip's own length, even past the video end.
    const length = Math.max(1, secondsToFrames(clip.startSec + clip.durationSec, fps) - start);
    return { start, length };
  };
  const sceneSpans = bgmClips.flatMap((clip) => {
    const match = /^bgm-scene-(\d+)-\d+$/.exec(clip.id);
    const scene = match ? scenes[Number(match[1])] : undefined;
    return scene ? [{ clip, scene, ...spanFrames(clip) }] : [];
  });
  /**
   * How far scene music has taken over at a frame: 0 outside, 1 inside, ramps at the edges. A
   * scene that runs to the video end keeps the cover, so the project BGM does not come back.
   */
  const sceneCover = (frame: number) =>
    sceneSpans.reduce(
      (cover, span) =>
        Math.max(
          cover,
          frame < span.start || frame >= span.start + span.length
            ? 0
            : computeFadeFactor(
                frame - span.start,
                span.length,
                true,
                span.start + span.length < totalFrames,
                fadeFrames,
              ),
        ),
      0,
    );

  const trackClips = project.bgm.flatMap((track: BgmTrack, index) => {
    const trackClip = bgmClips.find((clip) => clip.id === `bgm-${index}`);
    if (!trackClip) {
      return [];
    }
    const { start, length } = spanFrames(trackClip);
    return collectPlays(
      trackClip,
      staticFile(`bgm/${track.src}`),
      totalFrames,
      fps,
      (localFrame) =>
        Math.max(0, track.volume - duckAt(start + localFrame)) *
        computeFadeFactor(localFrame, length, track.fadeIn, track.fadeOut, fadeFrames) *
        (1 - sceneCover(start + localFrame)),
    );
  });
  const sceneClips = sceneSpans.flatMap(({ clip, scene, start, length }) =>
    collectPlays(
      clip,
      staticFile(`bgm/${scene.src}`),
      totalFrames,
      fps,
      (localFrame) =>
        Math.max(0, scene.volume - duckAt(start + localFrame)) *
        computeFadeFactor(localFrame, length, true, true, fadeFrames),
    ),
  );
  return [...trackClips, ...sceneClips];
}

export function createAudioManifest(
  project: SavedProject,
  timeline: SavedTimeline,
  fps: number,
  config: VideoAudioConfig,
): AudioClip[] {
  // Where open-ended spans end: the timeline length rounded to whole frames.
  const totalFrames = Math.max(1, secondsToFrames(timeline.durationSec, fps));
  const clips = [
    ...collectBgmClips(project, timeline, totalFrames, fps, config.bgm),
    ...collectTtsClips(project, timeline, totalFrames, fps, config.ttsPageTypes),
  ];
  // TTS ids are only enforced unique on comments pages.
  const seen = new Map<string, number>();
  return clips.map((clip) => {
    const count = seen.get(clip.id) ?? 0;
    seen.set(clip.id, count + 1);
    return count === 0 ? clip : { ...clip, id: `${clip.id}-${count}` };
  });
}
