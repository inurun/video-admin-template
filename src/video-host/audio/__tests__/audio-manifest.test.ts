import { describe, expect, it } from "vitest";
import {
  BGM_TRACK_ID,
  DEFAULT_PROJECT_META,
  SEQUENCE_TRACK_ID,
  type BgmTrack,
  type PageType,
  type SavedPage,
  type SavedProject,
  type SavedTimeline,
  type SavedTimelineClip,
  type SavedTts,
} from "@/_schemas";
import { toTimeline } from "@/server/features/project/to-timeline";
import type { VideoAudioConfig } from "../../contract";
import { collectDuckableIntervals } from "../ducking/collect-duckable-intervals";
import { computeDuckAmount } from "../ducking/compute-duck-amount";
import { computeFadeFactor } from "../ducking/compute-fade-factor";
import {
  createAudioManifest,
  sampleVolume,
  type AudioClip,
  type AudioVolumePoint,
} from "../audio-manifest";

const FPS = 30;
const CONFIG: VideoAudioConfig = {
  ttsPageTypes: ["intro", "eyecatch-text", "main", "comments"],
  bgm: {
    fadeSec: 1.5,
    duck: { drop: 0.2, downSec: 0.5, holdSec: 0.5, releaseSec: 1 },
    scenes: [],
  },
  cues: [],
};
const BGM_DUCK = CONFIG.bgm.duck;
const BGM_FADE_SEC = CONFIG.bgm.fadeSec;

function projectFromPages(pages: SavedPage[]): SavedProject {
  return { meta: DEFAULT_PROJECT_META, pages, bgm: [], voicePresets: {} };
}

function tts(
  id: string,
  options: { voiceName?: string; audio?: SavedTts["audio"]; padBeforeSec?: number } = {},
): SavedTts {
  return {
    id,
    provider: "voisona",
    text: id,
    voiceName: options.voiceName ?? "3",
    padBeforeSec: options.padBeforeSec ?? 0,
    padAfterSec: 0,
    volume: 0.8,
    audio: options.audio ?? { status: "ready", src: `/tts/${id}.wav`, durationSec: 1 },
    speech: {},
  };
}

function page(type: PageType, id: string, items: SavedTts[] = []): SavedPage {
  return {
    id,
    title: id,
    type,
    meta: { tags: [] },
    padBeforeSec: 0,
    padAfterSec: 0,
    richText: null,
    tts: items,
  } as unknown as SavedPage;
}

/** A sequence clip: `[id, startSec, durationSec, nested]`. */
type ClipSpec = [string, number, number, ClipSpec[]?];

function timelineOf(durationSec: number, pages: ClipSpec[]): SavedTimeline {
  const toClip = ([id, startSec, clipDurationSec, nested = []]: ClipSpec): SavedTimelineClip => ({
    id,
    startSec,
    durationSec: clipDurationSec,
    clips: nested.map(toClip),
  });
  return { durationSec, tracks: [{ id: SEQUENCE_TRACK_ID, clips: pages.map(toClip) }] };
}

function withBgm(project: SavedProject, bgm: Partial<BgmTrack>[]): SavedProject {
  return {
    ...project,
    bgm: bgm.map((track) => ({
      src: "a b.mp3",
      startSec: null,
      endSec: null,
      fadeIn: false,
      fadeOut: false,
      volume: 0.5,
      ...track,
    })),
  };
}

function eyecatchOf(durationSec: number) {
  return page("eyecatch-text", "eye", [
    tts("eye-tts", { audio: { status: "ready", src: "/tts/eye.wav", durationSec } }),
  ]);
}

function bgmClips(clips: AudioClip[]) {
  return clips.filter((clip) => clip.id.startsWith("bgm-"));
}

function manifest(project: SavedProject, timeline = toTimeline(project)) {
  return createAudioManifest(project, timeline, FPS, CONFIG);
}

function lerp(points: AudioVolumePoint[], t: number) {
  const index = points.findIndex((point) => point.t > t + 1e-9);
  if (index === -1) {
    return points.at(-1)!.v;
  }
  const a = points[index - 1]!;
  const b = points[index]!;
  return a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t);
}

describe("createAudioManifest", () => {
  it("places TTS at page start + clip start from the timeline", () => {
    const project = projectFromPages([page("intro", "intro"), page("main", "main", [tts("a")])]);
    const timeline = timelineOf(3, [
      ["intro", 0, 1.5],
      ["main", 1, 2, [["a", 0.5, 1]]],
    ]);

    expect(manifest(project, timeline)).toEqual([
      {
        id: "tts-main-a",
        src: "tts/a.wav",
        startSec: 1.5,
        durationSec: 1,
        volume: 0.8,
      },
    ]);
  });

  it("cuts TTS at the page end, and at the page start with a media offset", () => {
    const project = projectFromPages([page("main", "main", [tts("head"), tts("tail")])]);
    const timeline = timelineOf(2, [
      [
        "main",
        0,
        2,
        [
          ["head", -0.5, 1],
          ["tail", 1.5, 1],
        ],
      ],
    ]);

    expect(manifest(project, timeline)).toEqual([
      expect.objectContaining({
        id: "tts-main-head",
        startSec: 0,
        durationSec: 0.5,
        mediaStartSec: 0.5,
      }),
      expect.objectContaining({ id: "tts-main-tail", startSec: 1.5, durationSec: 0.5 }),
    ]);
  });

  it("skips TTS that is not ready or has no src", () => {
    const project = projectFromPages([
      page("main", "main", [
        tts("ok"),
        tts("pending", { audio: { status: "pending", src: "" } }),
        tts("failed", { audio: { status: "failed", src: "/x.wav", error: "e" } }),
        tts("blank", { audio: { status: "ready", src: " ", durationSec: 1 } }),
      ]),
    ]);

    expect(manifest(project).map((clip) => clip.id)).toEqual(["tts-main-ok"]);
  });

  it("plays TTS only on the configured page types", () => {
    const pages = (["intro", "eyecatch-text", "main", "comments", "outro", "endcard"] as const).map(
      (type) => page(type, type, [tts(`${type}-tts`)]),
    );
    const timeline = timelineOf(
      6,
      pages.map((item, index): ClipSpec => [item.id, index, 1, [[`${item.id}-tts`, 0, 1]]]),
    );

    expect(manifest(projectFromPages(pages), timeline).map((clip) => clip.id)).toEqual([
      "tts-intro-intro-tts",
      "tts-eyecatch-text-eyecatch-text-tts",
      "tts-main-main-tts",
      "tts-comments-comments-tts",
    ]);
  });

  it("encodes src relative to the public dir", () => {
    const project = withBgm(projectFromPages([page("eyecatch-text", "eye")]), [{}]);

    expect(manifest(project)[0]?.src).toBe("bgm/a%20b.mp3");
  });

  it("plays an unmeasured BGM once over its span with a constant gain when flat", () => {
    const project = withBgm(projectFromPages([page("eyecatch-text", "eye")]), [{}]);
    const timeline = toTimeline(project);

    expect(manifest(project, timeline)).toEqual([
      {
        id: "bgm-0-0",
        src: "bgm/a%20b.mp3",
        startSec: 0,
        durationSec: Math.round(timeline.durationSec * FPS) / FPS,
        volume: 0.5,
      },
    ]);
  });

  it("cuts BGM with an end at that end, or at the video end", () => {
    const project = withBgm(projectFromPages([eyecatchOf(3)]), [
      { startSec: 0.5, endSec: 1 },
      { startSec: 1, endSec: 99 },
      { startSec: 5, endSec: 6 },
    ]);
    const timeline = toTimeline(project, undefined, { "a b.mp3": 100 });

    expect(bgmClips(manifest(project, timeline))).toEqual([
      expect.objectContaining({ id: "bgm-0-0", startSec: 0.5, durationSec: 0.5 }),
      expect.objectContaining({ id: "bgm-1-0", startSec: 1, durationSec: 2 }),
    ]);
  });

  it("plays a looping BGM as consecutive clips from the media start, one per play", () => {
    const project = withBgm(projectFromPages([eyecatchOf(10)]), [{ startSec: 1 }]);
    const timeline = toTimeline(project, undefined, { "a b.mp3": 4 });

    const clips = bgmClips(manifest(project, timeline));
    expect(clips.map(({ id, startSec, durationSec }) => ({ id, startSec, durationSec }))).toEqual([
      { id: "bgm-0-0", startSec: 1, durationSec: 4 },
      { id: "bgm-0-1", startSec: 5, durationSec: 4 },
      { id: "bgm-0-2", startSec: 9, durationSec: 1 },
    ]);
    for (const clip of clips) {
      expect(clip).not.toHaveProperty("mediaStartSec");
      expect(clip).not.toHaveProperty("loop");
    }
  });

  it("crossfades scene music in over its span while the project BGM fades out under it", () => {
    const project = withBgm(projectFromPages([eyecatchOf(10)]), [{}]);
    const base = toTimeline(project);
    const timeline = {
      ...base,
      tracks: base.tracks.map((track) =>
        track.id === BGM_TRACK_ID
          ? {
              ...track,
              clips: [
                ...track.clips,
                {
                  id: "bgm-scene-0-0",
                  startSec: 4,
                  durationSec: 4,
                  clips: [{ id: "bgm-scene-0-0-0", startSec: 0, durationSec: 4, clips: [] }],
                },
              ],
            }
          : track,
      ),
    };
    const clips = createAudioManifest(project, timeline, FPS, {
      ...CONFIG,
      bgm: { ...CONFIG.bgm, scenes: [{ clip: "battle", src: "battle.mp3", volume: 0.8 }] },
    });

    const [main, scene] = bgmClips(clips);
    expect(scene).toMatchObject({ id: "bgm-scene-0-0-0", src: "bgm/battle.mp3", startSec: 4 });
    // The eyecatch TTS plays throughout, so both are ducked by `drop`.
    const drop = BGM_DUCK.drop;
    const sceneLane = scene!.volume as AudioVolumePoint[];
    expect(lerp(sceneLane, 0)).toBeCloseTo(0, 5);
    expect(lerp(sceneLane, 2)).toBeCloseTo(0.8 - drop, 5);
    const mainLane = main!.volume as AudioVolumePoint[];
    expect(lerp(mainLane, 1)).toBeCloseTo(0.5 - drop, 5);
    expect(lerp(mainLane, 6)).toBeCloseTo(0, 5);
    expect(lerp(mainLane, 9)).toBeCloseTo(0.5 - drop, 5);
  });

  it("keeps the project BGM out when scene music runs to the video end", () => {
    const project = withBgm(projectFromPages([eyecatchOf(10)]), [{}]);
    const base = toTimeline(project);
    const timeline = {
      ...base,
      tracks: base.tracks.map((track) =>
        track.id === BGM_TRACK_ID
          ? {
              ...track,
              clips: [
                ...track.clips,
                {
                  id: "bgm-scene-0-0",
                  startSec: 6,
                  durationSec: 4,
                  clips: [{ id: "bgm-scene-0-0-0", startSec: 0, durationSec: 4, clips: [] }],
                },
              ],
            }
          : track,
      ),
    };
    const clips = createAudioManifest(project, timeline, FPS, {
      ...CONFIG,
      bgm: { ...CONFIG.bgm, scenes: [{ clip: "battle", src: "battle.mp3", volume: 0.8 }] },
    });

    const [main, scene] = bgmClips(clips);
    expect(lerp(main!.volume as AudioVolumePoint[], 9.5)).toBeCloseTo(0, 5);
    expect(lerp(scene!.volume as AudioVolumePoint[], 3.5)).toBeGreaterThan(0);
  });

  it("plays a cue for every nested clip with its id, cut to the video end", () => {
    const project = projectFromPages([eyecatchOf(10)]);
    const base = toTimeline(project);
    const nest = (id: string, startSec: number, clips: SavedTimelineClip[] = []) => ({
      id,
      startSec,
      durationSec: 1,
      clips,
    });
    const timeline = {
      ...base,
      tracks: base.tracks.map((track) =>
        track.id === SEQUENCE_TRACK_ID
          ? {
              ...track,
              clips: track.clips.map((clip) => ({
                ...clip,
                clips: [
                  nest("action-0", 2, [nest("hit", 0.5)]),
                  nest("action-1", 5, [nest("hit", 0.2)]),
                  nest("hit", 9.5),
                ],
              })),
            }
          : track,
      ),
    };
    const clips = createAudioManifest(project, timeline, FPS, {
      ...CONFIG,
      cues: [{ clip: "hit", src: "hit.mp3", volume: 0.3 }],
    });

    expect(clips.filter((clip) => clip.src === "se/hit.mp3")).toEqual([
      { id: "cue-hit", src: "se/hit.mp3", startSec: 2.5, durationSec: 1, volume: 0.3 },
      { id: "cue-hit-1", src: "se/hit.mp3", startSec: 5.2, durationSec: 1, volume: 0.3 },
      { id: "cue-hit-2", src: "se/hit.mp3", startSec: 9.5, durationSec: 0.5, volume: 0.3 },
    ]);
  });

  it("continues the fade / duck curve across loop boundaries", () => {
    const project = withBgm(
      projectFromPages([
        eyecatchOf(10),
        page("main", "main", [
          tts("a", {
            padBeforeSec: 1,
            audio: { status: "ready", src: "/tts/a.wav", durationSec: 2 },
          }),
        ]),
      ]),
      [{ fadeIn: true, fadeOut: true, volume: 0.6 }],
    );
    const fileSec = 3.31;
    const timeline = toTimeline(project, undefined, { "a b.mp3": fileSec });
    const totalFrames = Math.round(timeline.durationSec * FPS);
    const intervals = collectDuckableIntervals(project, timeline, FPS);
    const expectedVolume = (frame: number) =>
      Math.max(
        0,
        0.6 -
          computeDuckAmount(
            frame,
            intervals,
            Math.round(BGM_DUCK.holdSec * FPS),
            Math.round(BGM_DUCK.downSec * FPS),
            Math.round(BGM_DUCK.releaseSec * FPS),
            BGM_DUCK.drop,
          ),
      ) * computeFadeFactor(frame, totalFrames, true, true, Math.round(BGM_FADE_SEC * FPS));

    const clips = bgmClips(manifest(project, timeline));
    expect(clips).toHaveLength(Math.ceil(timeline.durationSec / fileSec));
    let covered = 0;
    for (const clip of clips) {
      const from = Math.round(clip.startSec * FPS);
      const frames = Math.round(clip.durationSec * FPS);
      expect(from).toBe(covered);
      const points = clip.volume;
      for (let frame = 0; frame < frames; frame += 1) {
        const v = typeof points === "number" ? points : lerp(points, frame / FPS);
        expect(v).toBeCloseTo(expectedVolume(from + frame), 5);
      }
      covered = from + frames;
    }
    expect(covered).toBe(totalFrames);
  });

  it("writes the fade / duck curve as a lane that reproduces every frame", () => {
    const project = withBgm(
      projectFromPages([
        page("main", "main", [
          tts("a", {
            padBeforeSec: 3,
            audio: { status: "ready", src: "/tts/a.wav", durationSec: 2 },
          }),
          tts("b", { padBeforeSec: 3 }),
        ]),
      ]),
      [{ fadeIn: true, fadeOut: true, volume: 0.6 }],
    );
    const timeline = toTimeline(project);
    const totalFrames = Math.round(timeline.durationSec * FPS);
    const intervals = collectDuckableIntervals(project, timeline, FPS);
    const expectedVolume = (frame: number) =>
      Math.max(
        0,
        0.6 -
          computeDuckAmount(
            frame,
            intervals,
            Math.round(BGM_DUCK.holdSec * FPS),
            Math.round(BGM_DUCK.downSec * FPS),
            Math.round(BGM_DUCK.releaseSec * FPS),
            BGM_DUCK.drop,
          ),
      ) * computeFadeFactor(frame, totalFrames, true, true, Math.round(BGM_FADE_SEC * FPS));

    const [bgm] = manifest(project, timeline);
    const points = bgm?.volume as AudioVolumePoint[];

    expect(points.length).toBeLessThan(totalFrames / 10);
    for (let frame = 0; frame < totalFrames; frame += 1) {
      expect(lerp(points, frame / FPS)).toBeCloseTo(expectedVolume(frame), 5);
    }
  });

  it("gives every clip a unique id", () => {
    const project = withBgm(
      projectFromPages([
        page("intro", "intro", [tts("a"), tts("a")]),
        page("main", "main", [tts("a")]),
      ]),
      [{}, {}],
    );

    const ids = manifest(project).map((clip) => clip.id);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("sampleVolume", () => {
  it("keeps only the corners of a piecewise-linear curve", () => {
    const curve = [0, 0.5, 1, 1, 1, 0.5, 0];
    expect(sampleVolume((frame) => curve[frame]!, curve.length, 10)).toEqual([
      { t: 0, v: 0 },
      { t: 0.2, v: 1 },
      { t: 0.4, v: 1 },
      { t: 0.6, v: 0 },
    ]);
  });

  it("collapses a flat curve to a constant gain", () => {
    expect(sampleVolume(() => 0.3, 5, 10)).toBe(0.3);
  });
});
