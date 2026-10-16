import { beforeEach, describe, expect, it, vi } from "vitest";
import { createG2pItem } from "@/_schemas/__tests__/g2p-fixture";
import { HaqumeiApiError } from "../error";
import { validateG2pItems } from "../validate";

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

describe("validateG2pItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends one batch and returns schema v2 items", async () => {
    const g2p = createG2pItem("一時に一時の休息", "イチ'ジ|ニ/ヒトトキ|ノ|キューソク'");
    getHaqumeiApiClientMock.mockReturnValueOnce({
      POST: async () => ({
        response: new Response(null, { status: 200 }),
        data: { schema_version: "3", haqumei_version: "0.8.5", items: [g2p] },
      }),
    });

    await expect(validateG2pItems({}, [{ text: g2p.text, kana: g2p.kana }])).resolves.toEqual([
      g2p,
    ]);
  });

  it("does not chunk oversize batches", async () => {
    await expect(
      validateG2pItems(
        {},
        Array.from({ length: 257 }, (_, index) => ({ text: `t${index}`, kana: "ア'" })),
      ),
    ).rejects.toThrow(/exceeds 256 items/);
    expect(getHaqumeiApiClientMock).not.toHaveBeenCalled();
  });
});
