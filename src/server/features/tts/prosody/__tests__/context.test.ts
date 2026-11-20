import { describe, expect, it } from "vitest";
import type { SavedSequenceItem } from "@/_schemas";
import { createSavedTts } from "@/app/features/editor/store/__tests__/fixtures";
import { prosodyContextAt, prosodyContextOfEdited, prosodyContexts } from "../context";

const line = (id: string, speaker: string) => ({ id, text: id, speaker });

// A1 A2 B1 A3 A4
const lines = [line("A1", "a"), line("A2", "a"), line("B1", "b"), line("A3", "a"), line("A4", "a")];

describe("prosodyContextAt", () => {
  it("hears nothing with none", () => {
    expect(prosodyContextAt(lines, 1, { kind: "none" })).toBeUndefined();
  });

  it("hears up to n lines on each side with neighbors, joined by spaces", () => {
    expect(prosodyContextAt(lines, 2, { kind: "neighbors", utterances: 2 })).toEqual({
      previous: "A1 A2",
      next: "A3 A4",
    });
    expect(prosodyContextAt(lines, 0, { kind: "neighbors", utterances: 1 })).toEqual({
      next: "A2",
    });
  });

  it("hears the rest of its block with block", () => {
    expect(prosodyContextAt(lines, 0, { kind: "block" })).toEqual({ next: "A2" });
    expect(prosodyContextAt(lines, 1, { kind: "block" })).toEqual({ previous: "A1" });
    expect(prosodyContextAt(lines, 2, { kind: "block" })).toBeUndefined();
    expect(prosodyContextAt(lines, 4, { kind: "block" })).toEqual({ previous: "A3" });
  });
});

const voicevox = (id: string, text: string, voiceName: string) =>
  ({
    ...createSavedTts({ id, text, readText: text }),
    provider: "voicevox",
    voiceName,
  }) as ReturnType<typeof createSavedTts>;

const page = (tts: ReturnType<typeof createSavedTts>[]) =>
  ({
    id: "page-1",
    title: "Main",
    type: "main",
    meta: {},
    padBeforeSec: 0,
    padAfterSec: 0,
    richText: null,
    tts,
  }) as unknown as SavedSequenceItem;

describe("prosodyContexts", () => {
  it("tells speakers apart by voice", () => {
    const pages = [
      page([voicevox("t1", "一", "3"), voicevox("t2", "二", "3"), voicevox("t3", "三", "46")]),
    ];

    expect(
      Object.fromEntries(prosodyContexts(pages, new Set(["t1", "t3"]), { kind: "block" })),
    ).toEqual({ t1: { next: "二" } });
  });

  it("takes the neighbors from the target's comment group in playback order", () => {
    const comment = (no: number, body: string) => ({
      id: `sm1:thread:main:${no}`,
      threadId: "thread",
      fork: "main" as const,
      no,
      body,
      vposMs: no,
      postedAt: "2026-09-16T00:00:00.000Z",
      hidden: false,
    });
    const comments = {
      id: "page-comments",
      title: "Comments",
      type: "comments" as const,
      meta: {
        tags: [],
        niconico: { videoId: "sm1", fetchedAt: "2026-09-16T00:00:00.000Z" },
        presentation: "single" as const,
      },
      comments: [comment(1, "うぽつ"), comment(2, "質問")],
      commentGroups: [
        { id: "g1", commentIds: ["sm1:thread:main:1"], displayText: null, ttsIds: ["r1", "t1"] },
        { id: "g2", commentIds: ["sm1:thread:main:2"], displayText: null, ttsIds: ["r2"] },
      ],
      commentScenes: [
        { id: "s1", groupIds: ["g1"] },
        { id: "s2", groupIds: ["g2"] },
      ],
      padBeforeSec: 0,
      padAfterSec: 0,
      richText: null,
      tts: [
        createSavedTts({ id: "t1", text: "ありがとう", readText: "ありがとう" }),
        createSavedTts({ id: "r2", text: "質問", readText: "質問" }),
        createSavedTts({ id: "r1", text: "うぽつ", readText: "うぽつ" }),
      ],
    } as SavedSequenceItem;

    const contexts = prosodyContexts([comments], new Set(["t1", "r2"]), {
      kind: "neighbors",
      utterances: 2,
    });

    expect(Object.fromEntries(contexts)).toEqual({ t1: { previous: "うぽつ" } });
  });
});

describe("prosodyContextOfEdited", () => {
  const pages = [
    page([voicevox("t1", "一", "3"), voicevox("t2", "二", "3"), voicevox("t3", "三", "3")]),
  ];

  it("hears the saved page around the edited line", () => {
    expect(
      prosodyContextOfEdited(
        pages,
        { id: "t2", text: "二!", speaker: "voicevox::3::" },
        {
          kind: "block",
        },
      ),
    ).toEqual({ previous: "一", next: "三" });
  });

  it("starts another block when the edited line changed its voice", () => {
    expect(
      prosodyContextOfEdited(
        pages,
        { id: "t2", text: "二", speaker: "voicevox::46::" },
        {
          kind: "block",
        },
      ),
    ).toBeUndefined();
  });

  it("hears nothing for a line not saved yet", () => {
    expect(
      prosodyContextOfEdited(
        pages,
        { id: "new", text: "四", speaker: "voicevox::3::" },
        {
          kind: "block",
        },
      ),
    ).toBeUndefined();
  });
});
