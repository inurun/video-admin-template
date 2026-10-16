import { describe, expect, it, vi } from "vitest";
import { analyzeTexts } from "../analyze";
import { HaqumeiApiError } from "../error";
import { createG2pItem } from "@/_schemas/__tests__/g2p-fixture";

const { getHaqumeiApiClientMock } = vi.hoisted(() => ({
  getHaqumeiApiClientMock: vi.fn(),
}));

vi.mock("../client", () => ({
  getHaqumeiApiClient: getHaqumeiApiClientMock,
  unwrapHaqumeiData: (result: { data?: unknown; error?: unknown; response: Response }) => {
    if (result.response.ok && result.data !== undefined) {
      return result.data;
    }
    throw HaqumeiApiError.fromUnknown(result.error, result.response.status);
  },
}));

function analysisFailedError(path: string, text: string) {
  return {
    type: "about:blank",
    title: "Analysis failed",
    status: 500,
    code: "analysis_failed",
    detail: `${path} "${text}": mora mismatch: split=8 pitch_nuclei=7`,
    errors: [{ path, reason: "mora_mismatch" }],
  };
}

describe("analyzeTexts", () => {
  it("annotates chunkOffset on haqumei analyze errors", async () => {
    getHaqumeiApiClientMock.mockReturnValueOnce({
      POST: async () => ({
        response: new Response(null, { status: 500 }),
        error: analysisFailedError("texts[37]", "対象テキスト"),
      }),
    });

    const texts = Array.from({ length: 74 }, (_, index) => `t${index}`);
    texts[37] = "対象テキスト";

    await expect(analyzeTexts({}, texts)).rejects.toMatchObject({
      code: "analysis_failed",
      chunkOffset: 0,
      message: 'texts[37] "対象テキスト": mora mismatch: split=8 pitch_nuclei=7',
    });
  });

  it("converts chunk-local texts[n] using the chunk start offset", async () => {
    const firstChunk = Array.from({ length: 256 }, (_, index) => `t${index}`);
    getHaqumeiApiClientMock
      .mockReturnValueOnce({
        POST: async () => ({
          response: new Response(null, { status: 200 }),
          data: {
            schema_version: "3",
            haqumei_version: "0.8.5",
            items: firstChunk.map((text) => createG2pItem(text)),
          },
        }),
      })
      .mockReturnValueOnce({
        POST: async () => ({
          response: new Response(null, { status: 500 }),
          error: analysisFailedError("texts[1]", "対象テキスト"),
        }),
      });

    await expect(analyzeTexts({}, [...firstChunk, "t256", "対象テキスト"])).rejects.toMatchObject({
      chunkOffset: 256,
      errors: [{ path: "texts[1]", reason: "mora_mismatch" }],
    });
  });

  it("requests schema v3 and drops dictionary_words", async () => {
    const post = vi.fn(async () => ({
      response: new Response(null, { status: 200 }),
      data: {
        schema_version: "3",
        haqumei_version: "0.12.2",
        items: [
          {
            text: "雨衣",
            kana: "雨衣:アメコロ'",
            warnings: [],
            dictionary_words: [{ word_index: 0, kind: "fixed" }],
          },
        ],
      },
    }));
    getHaqumeiApiClientMock.mockReturnValueOnce({ POST: post });

    await expect(analyzeTexts({}, ["雨衣"])).resolves.toEqual([
      createG2pItem("雨衣", "雨衣:アメコロ'"),
    ]);
    expect(post).toHaveBeenCalledWith("/v1/analyze", {
      body: { schema_version: "3", texts: ["雨衣"] },
    });
  });
});
