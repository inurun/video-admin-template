import { describe, expect, it } from "vitest";
import type { SavedProject, SavedTimeline, SavedTimelineClip } from "@/_schemas";
import { SEQUENCE_TRACK_ID } from "@/_schemas";
import { collectDuckableIntervals as collectTtsIntervals } from "../collect-duckable-intervals";

const FPS = 30;

const defaultMeta: SavedProject["meta"] = {
  title: "p",
  description: "",
  width: 1920,
  height: 1080,
  weather: {},
  niconico: {
    title: "",
    description: "",
    thumbnailTime: "00:00.000",
    parentWorkIds: [],
    fixedParentWorkIds: [],
    tags: [],
  },
};

function clip(id: string, startSec: number, durationSec: number, clips: SavedTimelineClip[] = []) {
  return { id, startSec, durationSec, clips };
}

function timeline(clips: SavedTimelineClip[]): SavedTimeline {
  return {
    durationSec: 0,
    tracks: [{ id: SEQUENCE_TRACK_ID, clips }],
  };
}

function projectForClips(
  pageClips: SavedTimelineClip[],
  statusById: Record<string, "ready" | "pending" | "failed"> = {},
): SavedProject {
  return {
    meta: defaultMeta,
    bgm: [],
    voicePresets: {},
    pages: pageClips.map((page) => ({
      id: page.id,
      title: page.id,
      type: "main" as const,
      meta: { tags: [] },
      padBeforeSec: 0,
      padAfterSec: 0,
      richText: null,
      tts: page.clips.map((item) => {
        const status = statusById[item.id] ?? "ready";
        const audio =
          status === "ready"
            ? {
                status: "ready" as const,
                src: `/tts/${item.id}.wav`,
                durationSec: item.durationSec,
              }
            : status === "failed"
              ? { status: "failed" as const, src: `/tts/${item.id}.wav`, error: "failed" }
              : { status: "pending" as const, src: `/tts/${item.id}.wav` };
        return {
          id: item.id,
          provider: "voisona" as const,
          text: item.id,
          padBeforeSec: 0,
          padAfterSec: 0,
          volume: 1,
          speech: {},
          audio,
        };
      }),
    })),
  };
}

describe("collectTtsIntervals", () => {
  it("returns empty array for a project with no pages", () => {
    expect(collectTtsIntervals(projectForClips([]), timeline([]), FPS)).toEqual([]);
  });

  it("returns empty array when pages have no tts", () => {
    const pages = [clip("p", 0, 3)];
    expect(collectTtsIntervals(projectForClips(pages), timeline(pages), FPS)).toEqual([]);
  });

  it("keeps zero duration tts as one frame", () => {
    const pages = [clip("p", 0, 3, [clip("t", 0, 0)])];
    expect(collectTtsIntervals(projectForClips(pages), timeline(pages), FPS)).toEqual([]);
  });

  it("returns a single interval for one tts on one page", () => {
    const pages = [clip("p", 0, 1, [clip("t", 0, 1)])];
    expect(collectTtsIntervals(projectForClips(pages), timeline(pages), FPS)).toEqual([
      { from: 0, to: 30 },
    ]);
  });

  it("skips tts that is not ready", () => {
    const pages = [
      clip("p", 0, 3, [clip("ready", 0, 1), clip("pending", 1, 1), clip("failed", 2, 1)]),
    ];
    expect(
      collectTtsIntervals(
        projectForClips(pages, { pending: "pending", failed: "failed" }),
        timeline(pages),
        FPS,
      ),
    ).toEqual([{ from: 0, to: 30 }]);
  });

  it("offsets tts start by the child clip startSec", () => {
    const pages = [clip("p", 0, 2, [clip("t", 1, 1)])];
    expect(collectTtsIntervals(projectForClips(pages), timeline(pages), FPS)).toEqual([
      { from: 30, to: 60 },
    ]);
  });

  it("places multiple tts sequentially within a page", () => {
    const pages = [clip("p", 0, 3, [clip("t1", 0, 1), clip("t2", 1, 2)])];
    expect(collectTtsIntervals(projectForClips(pages), timeline(pages), FPS)).toEqual([
      { from: 0, to: 30 },
      { from: 30, to: 90 },
    ]);
  });

  it("offsets intervals on subsequent pages by the prior page start", () => {
    const pages = [clip("p1", 0, 3, [clip("t1", 0, 1)]), clip("p2", 3, 3, [clip("t2", 0, 1)])];
    expect(collectTtsIntervals(projectForClips(pages), timeline(pages), FPS)).toEqual([
      { from: 0, to: 30 },
      { from: 90, to: 120 },
    ]);
  });

  it("shortens subsequent page offsets by transition overlap duration", () => {
    const pages = [
      clip("p1", 0, 3, [clip("t1", 0, 1)]),
      clip("tr", 2.2, 0.8),
      clip("p2", 2.2, 3, [clip("t2", 0, 1)]),
    ];
    expect(collectTtsIntervals(projectForClips(pages), timeline(pages), FPS)).toEqual([
      { from: 0, to: 30 },
      { from: 66, to: 96 },
    ]);
  });

  it("ducks ready comment readings and replies but not group clips", () => {
    const pages = [clip("p", 0, 5, [clip("g1", 0, 5), clip("r1", 1, 1), clip("t1", 2, 2)])];
    const base = projectForClips(pages);
    const main = base.pages[0];
    if (!main || main.type === "transition") {
      throw new Error("expected page");
    }
    const project: SavedProject = {
      ...base,
      pages: [
        {
          ...main,
          type: "comments",
          meta: {
            tags: [],
            niconico: { videoId: "sm1", fetchedAt: "2026-09-16T00:00:00.000Z" },
            presentation: "single" as const,
          },
          richText: null,
          comments: [],
          commentGroups: [
            {
              id: "g1",
              commentIds: ["c1"],
              displayText: null,
              ttsIds: ["r1", "t1"],
            },
          ],
          commentScenes: [{ id: "s1", groupIds: ["g1"] }],
          tts: main.tts.filter((item) => item.id !== "g1"),
        },
      ],
    };
    expect(collectTtsIntervals(project, timeline(pages), FPS)).toEqual([
      { from: 30, to: 60 },
      { from: 60, to: 120 },
    ]);
  });
});
