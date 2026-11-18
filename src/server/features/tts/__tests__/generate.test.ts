import { beforeEach, describe, expect, it, vi } from "vitest";
import { createG2pItem } from "@/_schemas/__tests__/g2p-fixture";

const { generateG2pMock, analyzeProsodyMock } = vi.hoisted(() => ({
  generateG2pMock: vi.fn(),
  analyzeProsodyMock: vi.fn(),
}));

vi.mock("../llm-g2p", () => ({ generateG2p: generateG2pMock }));
vi.mock("../prosody/pipeline", () => ({ analyzeProsody: analyzeProsodyMock }));

import { generateTtsG2p } from "../use-case";

describe("generateTtsG2p", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        },
      ],
      { fresh: true },
    );
    expect(generateG2pMock).not.toHaveBeenCalled();
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
