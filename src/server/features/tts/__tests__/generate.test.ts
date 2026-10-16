import { describe, expect, it, vi } from "vitest";
import { createG2pItem } from "@/_schemas/__tests__/g2p-fixture";

const { generateG2pMock } = vi.hoisted(() => ({
  generateG2pMock: vi.fn(),
}));

vi.mock("../llm-g2p", () => ({ generateG2p: generateG2pMock }));

import { generateTtsG2p } from "../use-case";

describe("generateTtsG2p", () => {
  it("sends one sentence with its read text and neighbors in single mode", async () => {
    const g2p = createG2pItem("にんき", "にんき:ニンキ'");
    generateG2pMock.mockResolvedValueOnce(new Map([["tts-1", { g2p, source: "llm" }]]));

    await expect(
      generateTtsG2p(
        {},
        {
          pageId: "page-1",
          item: {
            id: "tts-1",
            text: "人気",
            readText: "にんき",
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
              { id: "tts-1", text: "にんき", target: true },
              { id: "tts-1:next", text: "次", target: false },
            ],
          },
        ],
      },
    );
  });
});
