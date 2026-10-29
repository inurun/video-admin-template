import { describe, expect, it } from "vitest";
import { buildG2pContext, buildSingleG2pContext, contextForChunk } from "../g2p-context";
import {
  createSavedMainPage,
  createSavedTts,
} from "@/app/features/editor/store/__tests__/fixtures";

describe("G2P context", () => {
  it("includes every TTS on pages that have a target, using the read text", () => {
    const pages = [
      createSavedMainPage({
        id: "page-prev",
        title: "Prev",
        tts: [createSavedTts({ id: "tts-prev", text: "前" })],
      }),
      createSavedMainPage({
        id: "page-1",
        title: "Main",
        tts: [
          createSavedTts({ id: "tts-1", text: "対象", readText: "たいしょう" }),
          createSavedTts({ id: "tts-2", text: "peak", readText: "" }),
        ],
      }),
    ];

    expect(buildG2pContext(pages, [{ pageId: "page-1", ttsId: "tts-1" }])).toEqual([
      {
        id: "page-1",
        title: "Main",
        utterances: [
          { id: "tts-1", text: "たいしょう", target: true, provider: "voisona" },
          { id: "tts-2", text: "peak", target: false },
        ],
      },
    ]);
  });

  it("keeps page context and marks only the chunk as target", () => {
    const pages = buildG2pContext(
      [
        createSavedMainPage({
          id: "page-1",
          title: "Main",
          tts: [
            createSavedTts({ id: "tts-1", text: "一", readText: "一" }),
            createSavedTts({ id: "tts-2", text: "二", readText: "二" }),
            createSavedTts({ id: "tts-3", text: "三", readText: "三" }),
          ],
        }),
      ],
      [
        { pageId: "page-1", ttsId: "tts-1" },
        { pageId: "page-1", ttsId: "tts-2" },
      ],
    );
    const withDictionary = pages.map((page) => ({
      ...page,
      utterances: page.utterances.map((utterance) =>
        utterance.id === "tts-1"
          ? {
              ...utterance,
              dictionary: [{ kind: "fixed" as const, surface: "一", reading: "イチ", accent: 2 }],
            }
          : utterance,
      ),
    }));

    expect(contextForChunk(withDictionary, new Set(["tts-2"]))[0]?.utterances).toEqual([
      { id: "tts-1", text: "一", target: false },
      { id: "tts-2", text: "二", target: true, provider: "voisona" },
      { id: "tts-3", text: "三", target: false },
    ]);
  });

  it("limits comments G2P context to the target group in playback order", () => {
    const page = {
      id: "page-comments",
      title: "Comments",
      type: "comments" as const,
      meta: {
        tags: [],
        niconico: { videoId: "sm1", fetchedAt: "2026-09-16T00:00:00.000Z" },
        presentation: "single" as const,
      },
      comments: [
        {
          id: "sm1:thread:main:1",
          threadId: "thread",
          fork: "main" as const,
          no: 1,
          body: "うぽつ",
          vposMs: 0,
          postedAt: "2026-09-16T00:00:00.000Z",
          hidden: false,
        },
        {
          id: "sm1:thread:main:2",
          threadId: "thread",
          fork: "main" as const,
          no: 2,
          body: "質問",
          vposMs: 1,
          postedAt: "2026-09-16T00:00:01.000Z",
          hidden: false,
        },
      ],
      commentGroups: [
        {
          id: "g1",
          commentIds: ["sm1:thread:main:1"],
          displayText: null,
          ttsIds: ["r1", "t1"],
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
      padBeforeSec: 0,
      padAfterSec: 0,
      richText: null,
      tts: [
        createSavedTts({ id: "t1", text: "ありがとう", readText: "ありがとう" }),
        createSavedTts({ id: "r2", text: "質問", readText: "質問" }),
        createSavedTts({ id: "r1", text: "うぽつ", readText: "うぽつ" }),
      ],
    };

    expect(buildG2pContext([page], [{ pageId: "page-comments", ttsId: "t1" }])).toEqual([
      {
        id: "page-comments",
        title: "Comments",
        utterances: [
          { id: "r1", text: "うぽつ", target: false },
          { id: "t1", text: "ありがとう", target: true, provider: "voisona" },
        ],
      },
    ]);
  });

  it("builds a one-sentence context from neighbors", () => {
    expect(
      buildSingleG2pContext({
        pageId: "page-1",
        id: "tts-1",
        text: "今日",
        provider: "voicevox",
        previous: "前",
      }),
    ).toEqual([
      {
        id: "page-1",
        title: "",
        utterances: [
          { id: "tts-1:previous", text: "前", target: false },
          { id: "tts-1", text: "今日", target: true, provider: "voicevox" },
        ],
      },
    ]);
  });
});
