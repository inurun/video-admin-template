import { beforeEach, describe, expect, it, vi } from "vitest";
import { createG2pItem } from "@/_schemas/__tests__/g2p-fixture";
import { createSavedTts } from "@/app/features/editor/store/__tests__/fixtures";
import type { ProsodyContextConfig } from "@/video-host/contract";

const { generateG2pMock, analyzeProsodyMock, readSavedProjectMock, contextConfig } = vi.hoisted(
  () => ({
    generateG2pMock: vi.fn(),
    analyzeProsodyMock: vi.fn(),
    readSavedProjectMock: vi.fn(),
    contextConfig: {
      context: { kind: "neighbors", utterances: 2 } as ProsodyContextConfig,
    },
  }),
);

vi.mock("../llm-g2p", () => ({ generateG2p: generateG2pMock }));
vi.mock("../prosody/pipeline", () => ({ analyzeProsody: analyzeProsodyMock }));
vi.mock("@/server/_shared/storage", async () => ({
  ...(await vi.importActual<typeof import("@/server/_shared/storage")>("@/server/_shared/storage")),
  readSavedProject: readSavedProjectMock,
}));
vi.mock("@/video/config", async () => {
  const actual = await vi.importActual<typeof import("@/video/config")>("@/video/config");
  return {
    ...actual,
    get speechVoiceConfig() {
      return { ...actual.speechVoiceConfig, ...contextConfig };
    },
  };
});

import { generateTtsG2p } from "../use-case";

describe("generateTtsG2p", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contextConfig.context = { kind: "neighbors", utterances: 2 };
    // The saved page: 前 (VOICEVOX 3) before the line being made again.
    readSavedProjectMock.mockResolvedValue({
      pages: [
        {
          id: "page-1",
          type: "main",
          tts: [
            {
              ...createSavedTts({ id: "tts-0", text: "前", readText: "前" }),
              provider: "voicevox",
              voiceName: "3",
            },
            {
              ...createSavedTts({ id: "tts-1", text: "人気", readText: "人気" }),
              provider: "voicevox",
              voiceName: "3",
            },
          ],
        },
      ],
    });
  });

  it("sends one sentence with its read text and neighbors in single mode", async () => {
    const g2p = createG2pItem("にんき", "にんき:ニンキ'");
    generateG2pMock.mockResolvedValueOnce(new Map([["tts-1", { g2p, source: "llm" }]]));

    await expect(
      generateTtsG2p(
        {},
        {
          projectPath: "project",
          pageId: "page-1",
          item: {
            id: "tts-1",
            text: "人気",
            readText: "にんき",
            provider: "coeiroink",
            previous: { text: "前", readText: "" },
            next: { text: "次" },
          },
        },
      ),
    ).resolves.toEqual({ g2p, source: "llm" });

    expect(generateG2pMock).toHaveBeenCalledWith(
      {},
      {
        mode: "single",
        pages: [
          {
            id: "page-1",
            title: "",
            utterances: [
              { id: "tts-1:previous", text: "前", target: false },
              { id: "tts-1", text: "にんき", target: true, provider: "coeiroink" },
              { id: "tts-1:next", text: "次", target: false },
            ],
          },
        ],
      },
    );
  });

  it("analyzes a prosody engine's sentence again, reading and checking a new reference", async () => {
    const g2p = createG2pItem("にんき", "にんき:ニンキ'");
    const prosody = { moras: [], pauses: [] };
    analyzeProsodyMock.mockResolvedValueOnce([{ g2p, prosody }]);

    await expect(
      generateTtsG2p(
        {},
        {
          projectPath: "project",
          pageId: "page-1",
          item: {
            id: "tts-1",
            text: "人気",
            readText: "にんき",
            provider: "voicevox",
            voiceName: "3",
            previous: { text: "前" },
          },
        },
      ),
    ).resolves.toEqual({ g2p, source: "prosody" });

    expect(analyzeProsodyMock).toHaveBeenCalledWith(
      {},
      [
        {
          readText: "にんき",
          source: expect.objectContaining({ voice: expect.any(String) }),
          context: { previous: "前" },
        },
      ],
      { fresh: true },
    );
    expect(generateG2pMock).not.toHaveBeenCalled();
  });

  it("sends the reference TTS no neighbors when the config gives no context", async () => {
    contextConfig.context = { kind: "none" };
    const g2p = createG2pItem("にんき", "にんき:ニンキ'");
    analyzeProsodyMock.mockResolvedValueOnce([{ g2p, prosody: { moras: [], pauses: [] } }]);

    await generateTtsG2p(
      {},
      {
        projectPath: "project",
        pageId: "page-1",
        item: {
          id: "tts-1",
          text: "人気",
          readText: "にんき",
          provider: "voicevox",
          voiceName: "3",
          previous: { text: "前" },
        },
      },
    );

    expect(analyzeProsodyMock.mock.calls[0]?.[1]).toEqual([
      { readText: "にんき", source: expect.objectContaining({ voice: expect.any(String) }) },
    ]);
  });

  it("reports analyze when the new reference did not pass", async () => {
    const g2p = createG2pItem("にんき", "にんき:ニンキ'");
    analyzeProsodyMock.mockResolvedValueOnce([{ g2p }]);

    await expect(
      generateTtsG2p(
        {},
        {
          projectPath: "project",
          pageId: "page-1",
          item: { id: "tts-1", text: "にんき", provider: "voisona" },
        },
      ),
    ).resolves.toEqual({ g2p, source: "analyze" });
  });
});
