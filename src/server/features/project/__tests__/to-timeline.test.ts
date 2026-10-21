import { describe, expect, it } from "vitest";
import type { SavedPage, SavedProject } from "@/_schemas";
import { BGM_TRACK_ID, EMPTY_TIMELINE, SEQUENCE_TRACK_ID, savedPageSchema } from "@/_schemas";
import { EYECATCH_TEXT_MIN_DURATION_SEC, MIN_TTS_DURATION_SECONDS } from "@/constants";
import { toTimeline } from "../to-timeline";

function tts(
  id: string,
  durationSec: number,
  text: string,
  voiceName = "zunda",
): Extract<SavedPage, { type: "main" }>["tts"][number] {
  return {
    id,
    provider: "voisona",
    text,
    voiceName,
    padBeforeSec: 0,
    padAfterSec: 0,
    volume: 1,
    audio: { status: "ready", src: `/tts/${id}.wav`, durationSec },
    speech: {},
  };
}

function mainPage(overrides: Partial<Extract<SavedPage, { type: "main" }>> = {}): SavedPage {
  return {
    id: "page-1",
    title: "Page",
    type: "main",
    meta: { tags: [] },
    padBeforeSec: 0,
    padAfterSec: 0,
    richText: null,
    tts: [
      {
        id: "tts-1",
        provider: "voisona",
        text: "Hello",
        padBeforeSec: 0,
        padAfterSec: 0,
        volume: 1,
        audio: { status: "ready", src: "/tts/a.wav", durationSec: 1.1 },
        speech: {},
      },
    ],
    ...overrides,
  };
}

function project(pages: SavedProject["pages"]): SavedProject {
  return {
    meta: {
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
        tags: [],
      },
    },
    bgm: [],
    pages,
    voicePresets: {},
  };
}

describe("toTimeline", () => {
  it("keeps previous duration for an existing page with pending tts", () => {
    const timeline = toTimeline(
      project([
        mainPage({
          tts: [
            {
              id: "tts-1",
              provider: "voisona",
              text: "Hello",
              padBeforeSec: 0,
              padAfterSec: 0,
              volume: 1,
              audio: { status: "pending", src: "/tts/a.wav" },
              speech: {},
            },
          ],
        }),
      ]),
      {
        ...EMPTY_TIMELINE,
        tracks: [
          {
            id: SEQUENCE_TRACK_ID,
            clips: [{ id: "page-1", startSec: 0, durationSec: 4, clips: [] }],
          },
        ],
      },
    );

    expect(timeline.tracks[0]?.clips[0]?.durationSec).toBe(4);
  });

  it("uses pads and transition minimum for a new intro/main page", () => {
    const timeline = toTimeline(
      project([
        mainPage({
          padBeforeSec: 1,
          padAfterSec: 0.5,
          tts: [
            {
              id: "tts-1",
              provider: "voisona",
              text: "Hello",
              padBeforeSec: 0,
              padAfterSec: 0,
              volume: 1,
              audio: { status: "pending", src: "/tts/a.wav" },
              speech: {},
            },
          ],
        }),
      ]),
    );
    expect(timeline.tracks[0]?.clips[0]?.durationSec).toBe(1.5);
  });

  it("uses eyecatch minimum without page pads", () => {
    const page: SavedPage = {
      id: "eye",
      title: "Eye",
      type: "eyecatch-text",
      meta: { tags: [] },
      padBeforeSec: 1,
      padAfterSec: 1,
      richText: null,
      tts: [
        {
          id: "tts-1",
          provider: "voisona",
          text: "Hello",
          padBeforeSec: 0,
          padAfterSec: 0,
          volume: 1,
          audio: { status: "pending", src: "/tts/a.wav" },
          speech: {},
        },
      ],
    };
    expect(toTimeline(project([page])).tracks[0]?.clips[0]?.durationSec).toBe(
      EYECATCH_TEXT_MIN_DURATION_SEC,
    );
  });

  it("computes ready duration from playable tts", () => {
    const timeline = toTimeline(
      project([
        mainPage({
          padBeforeSec: 0.5,
          padAfterSec: 0.5,
          tts: [
            {
              id: "tts-1",
              provider: "voisona",
              text: "Hello",
              padBeforeSec: 0,
              padAfterSec: 0,
              volume: 1,
              audio: { status: "ready", src: "/tts/a.wav", durationSec: 1 },
              speech: {},
            },
          ],
        }),
      ]),
    );
    expect(timeline.tracks[0]?.clips[0]?.durationSec).toBe(2);
  });

  it("does not go below the minimum tts duration", () => {
    const timeline = toTimeline(
      project([
        {
          id: "eye",
          title: "Eye",
          type: "eyecatch-text",
          meta: { tags: [] },
          padBeforeSec: 0,
          padAfterSec: 0,
          richText: null,
          tts: [],
        },
      ]),
    );
    expect(timeline.tracks[0]?.clips[0]?.durationSec).toBe(EYECATCH_TEXT_MIN_DURATION_SEC);
    expect(timeline.tracks[0]?.clips[0]?.durationSec).toBeGreaterThanOrEqual(
      MIN_TTS_DURATION_SECONDS,
    );
  });

  it("writes outro visual clips and keeps hold/fade in page duration", () => {
    const page = savedPageSchema.parse({
      id: "outro",
      title: "Outro",
      type: "outro",
      meta: {
        tags: [],
        blocks: [
          { id: "a", url: "https://a.example", impression: "" },
          { id: "b", url: "https://b.example", impression: "" },
          { id: "c", url: "https://c.example", impression: "" },
        ],
      },
      padBeforeSec: 0,
      padAfterSec: 0,
      richText: null,
      tts: [],
    });
    const clip = toTimeline(project([page])).tracks[0]?.clips[0];
    expect(
      clip?.clips.map(({ id, startSec, durationSec }) => ({ id, startSec, durationSec })),
    ).toEqual([
      { id: "outro-page-0", startSec: 0.5, durationSec: 5 },
      { id: "outro-page-1", startSec: 5.5, durationSec: 5 },
    ]);
    expect(clip?.durationSec).toBe(10.5);
  });

  it("plays scene music over each nested clip with the scene's id, looping the file", () => {
    const page = savedPageSchema.parse({
      id: "outro",
      title: "Outro",
      type: "outro",
      meta: {
        tags: [],
        blocks: [
          { id: "a", url: "https://a.example", impression: "" },
          { id: "b", url: "https://b.example", impression: "" },
          { id: "c", url: "https://c.example", impression: "" },
        ],
      },
      padBeforeSec: 0,
      padAfterSec: 0,
      richText: null,
      tts: [],
    });
    const timeline = toTimeline(project([page]), undefined, { "battle.mp3": 2 }, [
      { clip: "outro-page-1", src: "battle.mp3", volume: 1 },
    ]);
    const bgm = timeline.tracks.find((track) => track.id === BGM_TRACK_ID);
    expect(bgm?.clips).toEqual([
      {
        id: "bgm-scene-0-0",
        startSec: 5.5,
        durationSec: 5,
        clips: [
          { id: "bgm-scene-0-0-0", startSec: 0, durationSec: 2, clips: [] },
          { id: "bgm-scene-0-0-1", startSec: 2, durationSec: 2, clips: [] },
          { id: "bgm-scene-0-0-2", startSec: 4, durationSec: 1, clips: [] },
        ],
      },
    ]);
  });

  it("sizes endcard from advertiser pages minus slide overlap", () => {
    const page = savedPageSchema.parse({
      id: "endcard",
      title: "Endcard",
      type: "endcard",
      meta: {
        tags: [],
        nicoadSource: "",
        credits: [],
        advertisers: [
          {
            id: "ad-1",
            identityKey: "user:1",
            introductionCount: 1,
            name: "Ada",
            message: "",
          },
          {
            id: "ad-2",
            identityKey: "user:2",
            introductionCount: 1,
            name: "Bob",
            message: "",
          },
        ],
        messages: [],
      },
      padBeforeSec: 0.5,
      padAfterSec: 0.25,
      richText: null,
      tts: [],
    });
    const clip = toTimeline(project([page])).tracks[0]?.clips[0];
    expect(
      clip?.clips.map(({ id, startSec, durationSec }) => ({ id, startSec, durationSec })),
    ).toEqual([
      { id: "endcard-page-0", startSec: 0, durationSec: 8 },
      { id: "endcard-page-1", startSec: 7.2, durationSec: 8 },
    ]);
    expect(clip?.durationSec).toBe(15.95);
  });

  it("lays out comments groups independently of tts array order", () => {
    const page = savedPageSchema.parse({
      id: "comments",
      title: "Comments",
      type: "comments",
      meta: {
        tags: [],
        niconico: { videoId: "sm1", fetchedAt: "2026-09-16T00:00:00.000Z" },
      },
      comments: [
        {
          id: "sm1:thread:main:1",
          threadId: "thread",
          fork: "main",
          no: 1,
          body: "うぽつ",
          vposMs: 0,
          postedAt: "2026-09-16T00:00:00.000Z",
        },
        {
          id: "sm1:thread:main:2",
          threadId: "thread",
          fork: "main",
          no: 2,
          body: "質問",
          vposMs: 1,
          postedAt: "2026-09-16T00:00:01.000Z",
        },
      ],
      commentGroups: [
        {
          id: "g1",
          commentIds: ["sm1:thread:main:1"],
          displayText: null,
          ttsIds: ["r1", "t1", "t2"],
        },
        {
          id: "g2",
          commentIds: ["sm1:thread:main:2"],
          displayText: null,
          ttsIds: ["r2"],
        },
      ],
      commentScenes: [
        { id: "s1", groupIds: ["g1"] },
        { id: "s2", groupIds: ["g2"] },
      ],
      padBeforeSec: 1,
      padAfterSec: 1,
      richText: null,
      tts: [
        tts("t2", 2, "今回もよろしくね。", "himari"),
        tts("r1", 1, "うぽつ"),
        tts("t1", 1, "ありがとう", "himari"),
        tts("r2", 1, "質問"),
      ],
    });

    const clip = toTimeline(project([page])).tracks[0]?.clips[0];
    expect(clip?.durationSec).toBe(7);
    expect(
      clip?.clips.map(({ id, startSec, durationSec }) => ({ id, startSec, durationSec })),
    ).toEqual([
      { id: "r1", startSec: 1, durationSec: 1 },
      { id: "t1", startSec: 2, durationSec: 1 },
      { id: "t2", startSec: 3, durationSec: 2 },
      { id: "g1", startSec: 0, durationSec: 5 },
      { id: "r2", startSec: 5, durationSec: 1 },
      { id: "g2", startSec: 5, durationSec: 1 },
    ]);
    expect(page).not.toHaveProperty("durationSec");
  });

  it("lays out only center tts for triple comments and skips empty centers", () => {
    const comments = [1, 2, 3, 4, 5, 6].map((no) => ({
      id: `sm1:thread:main:${no}`,
      threadId: "thread",
      fork: "main" as const,
      no,
      body: `c${no}`,
      vposMs: no,
      postedAt: "2026-09-16T00:00:00.000Z",
    }));
    const page = savedPageSchema.parse({
      id: "comments",
      title: "Comments",
      type: "comments",
      meta: {
        tags: [],
        niconico: { videoId: "sm1", fetchedAt: "2026-09-16T00:00:00.000Z" },
        presentation: "triple",
      },
      comments,
      commentGroups: [
        { id: "g1", commentIds: [comments[0]!.id], displayText: null, ttsIds: ["s1"] },
        { id: "g2", commentIds: [comments[1]!.id], displayText: null, ttsIds: [] },
        { id: "g3", commentIds: [comments[2]!.id], displayText: null, ttsIds: ["s3"] },
        { id: "g4", commentIds: [comments[3]!.id], displayText: null, ttsIds: ["s4"] },
        { id: "g5", commentIds: [comments[4]!.id], displayText: null, ttsIds: ["c5"] },
        { id: "g6", commentIds: [comments[5]!.id], displayText: null, ttsIds: ["s6"] },
      ],
      commentScenes: [
        { id: "s1", groupIds: ["g1", "g2", "g3"] },
        { id: "s2", groupIds: ["g4", "g5", "g6"] },
      ],
      padBeforeSec: 1,
      padAfterSec: 1,
      richText: null,
      tts: [
        tts("s1", 4, "side"),
        tts("s3", 4, "side"),
        tts("s4", 4, "side"),
        tts("c5", 2, "center"),
        tts("s6", 4, "side"),
      ],
    });

    const clip = toTimeline(project([page])).tracks[0]?.clips[0];
    expect(clip?.durationSec).toBe(4);
    expect(
      clip?.clips.map(({ id, startSec, durationSec }) => ({ id, startSec, durationSec })),
    ).toEqual([
      { id: "c5", startSec: 1, durationSec: 2 },
      { id: "g5", startSec: 0, durationSec: 3 },
    ]);
  });

  it("skips comments groups that have no tts", () => {
    const page = savedPageSchema.parse({
      id: "comments",
      title: "Comments",
      type: "comments",
      meta: {
        tags: [],
        niconico: { videoId: "sm1", fetchedAt: "2026-09-16T00:00:00.000Z" },
      },
      comments: [
        {
          id: "sm1:thread:main:1",
          threadId: "thread",
          fork: "main",
          no: 1,
          body: "うぽつ",
          vposMs: 0,
          postedAt: "2026-09-16T00:00:00.000Z",
        },
        {
          id: "sm1:thread:main:2",
          threadId: "thread",
          fork: "main",
          no: 2,
          body: "質問",
          vposMs: 1,
          postedAt: "2026-09-16T00:00:01.000Z",
        },
      ],
      commentGroups: [
        {
          id: "g1",
          commentIds: ["sm1:thread:main:1"],
          displayText: null,
          ttsIds: ["t1", "t2"],
        },
        {
          id: "g2",
          commentIds: ["sm1:thread:main:2"],
          displayText: null,
          ttsIds: [],
        },
      ],
      commentScenes: [
        { id: "s1", groupIds: ["g1"] },
        { id: "s2", groupIds: ["g2"] },
      ],
      padBeforeSec: 1,
      padAfterSec: 1,
      richText: null,
      tts: [tts("t1", 1, "ありがとう", "himari"), tts("t2", 2, "よろしく", "himari")],
    });

    const clip = toTimeline(project([page])).tracks[0]?.clips[0];
    expect(clip?.durationSec).toBe(5);
    expect(
      clip?.clips.map(({ id, startSec, durationSec }) => ({ id, startSec, durationSec })),
    ).toEqual([
      { id: "t1", startSec: 1, durationSec: 1 },
      { id: "t2", startSec: 2, durationSec: 2 },
      { id: "g1", startSec: 0, durationSec: 4 },
    ]);
  });

  it("does not freeze comments duration when audio is still pending", () => {
    const page = savedPageSchema.parse({
      id: "comments",
      title: "Comments",
      type: "comments",
      meta: {
        tags: [],
        niconico: { videoId: "sm1", fetchedAt: "2026-09-16T00:00:00.000Z" },
      },
      comments: [
        {
          id: "sm1:thread:main:1",
          threadId: "thread",
          fork: "main",
          no: 1,
          body: "うぽつ",
          vposMs: 0,
          postedAt: "2026-09-16T00:00:00.000Z",
        },
      ],
      commentGroups: [
        {
          id: "g1",
          commentIds: ["sm1:thread:main:1"],
          displayText: null,
          ttsIds: ["r1"],
        },
      ],
      commentScenes: [{ id: "s1", groupIds: ["g1"] }],
      padBeforeSec: 1,
      padAfterSec: 1,
      richText: null,
      tts: [
        {
          id: "r1",
          provider: "voisona",
          text: "うぽつ",
          voiceName: "zunda",
          padBeforeSec: 0,
          padAfterSec: 0,
          volume: 1,
          audio: { status: "pending", src: "/tts/r1.wav" },
          speech: {},
        },
      ],
    });

    const timeline = toTimeline(project([page]), {
      ...EMPTY_TIMELINE,
      tracks: [
        {
          id: SEQUENCE_TRACK_ID,
          clips: [{ id: "comments", startSec: 0, durationSec: 99, clips: [] }],
        },
      ],
    });
    expect(timeline.tracks[0]?.clips[0]?.durationSec).toBe(2 + MIN_TTS_DURATION_SECONDS);
    expect(timeline.tracks[0]?.clips[0]?.clips).toEqual([
      {
        id: "r1",
        startSec: 1,
        durationSec: MIN_TTS_DURATION_SECONDS,
        clips: [],
      },
      { id: "g1", startSec: 0, durationSec: 1 + MIN_TTS_DURATION_SECONDS, clips: [] },
    ]);
  });

  describe("bgm track", () => {
    const track = (overrides: Partial<SavedProject["bgm"][number]> = {}) => ({
      src: "a.mp3",
      startSec: null,
      endSec: null,
      fadeIn: false,
      fadeOut: false,
      volume: 1,
      ...overrides,
    });
    const withBgm = (bgm: SavedProject["bgm"]) => ({
      ...project([mainPage({ padAfterSec: 10 - 1.1 })]),
      bgm,
    });
    const bgmTrack = (timeline: ReturnType<typeof toTimeline>) =>
      timeline.tracks.find((item) => item.id === BGM_TRACK_ID);

    it("is absent without bgm", () => {
      expect(bgmTrack(toTimeline(project([mainPage()])))).toBeUndefined();
    });

    it("nests one clip per play of a looping file, the last one cut at the video end", () => {
      const timeline = toTimeline(withBgm([track({ startSec: 1 })]), undefined, { "a.mp3": 4 });

      expect(timeline.durationSec).toBeCloseTo(10);
      expect(bgmTrack(timeline)?.clips).toEqual([
        {
          id: "bgm-0",
          startSec: 1,
          durationSec: expect.closeTo(9),
          clips: [
            { id: "bgm-0-0", startSec: 0, durationSec: 4, clips: [] },
            { id: "bgm-0-1", startSec: 4, durationSec: 4, clips: [] },
            { id: "bgm-0-2", startSec: 8, durationSec: expect.closeTo(1), clips: [] },
          ],
        },
      ]);
    });

    it("adds no empty play when the span is an exact multiple of the file", () => {
      const timeline = toTimeline(withBgm([track()]), undefined, { "a.mp3": 10 / 3 });

      expect(bgmTrack(timeline)?.clips[0]?.clips.map((clip) => clip.id)).toEqual([
        "bgm-0-0",
        "bgm-0-1",
        "bgm-0-2",
      ]);
    });

    it("plays a file with an end once, up to its length", () => {
      const timeline = toTimeline(
        withBgm([
          track({ startSec: 2, endSec: 8 }),
          track({ src: "b.mp3", startSec: 0, endSec: 3 }),
          track({ startSec: 5, endSec: 4 }),
        ]),
        undefined,
        { "a.mp3": 4, "b.mp3": 9 },
      );

      expect(bgmTrack(timeline)?.clips).toEqual([
        {
          id: "bgm-0",
          startSec: 2,
          durationSec: 6,
          clips: [{ id: "bgm-0-0", startSec: 0, durationSec: 4, clips: [] }],
        },
        {
          id: "bgm-1",
          startSec: 0,
          durationSec: 3,
          clips: [{ id: "bgm-1-0", startSec: 0, durationSec: 3, clips: [] }],
        },
        { id: "bgm-2", startSec: 5, durationSec: 0, clips: [] },
      ]);
    });

    it("plays an unmeasured file once over the whole span", () => {
      const timeline = toTimeline(withBgm([track()]));

      expect(bgmTrack(timeline)?.clips[0]?.clips).toEqual([
        { id: "bgm-0-0", startSec: 0, durationSec: expect.closeTo(10), clips: [] },
      ]);
    });
  });
});
