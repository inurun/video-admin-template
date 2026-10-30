import { describe, expect, it } from "vitest";
import type { G2pReviewViewItem } from "@/server/features/g2p-review/contract";
import { filterReviewItems, initialKana, nextItemId } from "../review-queue";

function item(overrides: Partial<G2pReviewViewItem>): G2pReviewViewItem {
  return {
    id: "a",
    text: "犬",
    voice: { provider: "voicevox", voiceName: "3" },
    alternatives: [],
    reviewed: false,
    candidates: [],
    mismatched: false,
    ...overrides,
  };
}

describe("review queue", () => {
  const items = [
    item({ id: "a" }),
    item({ id: "b", reviewed: true, kana: "犬:イヌ'", mismatched: true }),
    item({ id: "c", reviewed: true, kana: "犬:イヌ'" }),
  ];

  it("filters by review state", () => {
    expect(filterReviewItems(items, "unreviewed").map(({ id }) => id)).toEqual(["a"]);
    expect(filterReviewItems(items, "mismatched").map(({ id }) => id)).toEqual(["b"]);
    expect(filterReviewItems(items, "all")).toHaveLength(3);
  });

  it("prefers the saved kana over the top candidate", () => {
    const candidates = [{ kana: "犬:イ'ヌ", prosody: "イ'ヌ", count: 2, status: "other" as const }];
    expect(initialKana(item({ candidates }))).toBe("犬:イ'ヌ");
    expect(initialKana(item({ candidates, kana: "犬:イヌ'" }))).toBe("犬:イヌ'");
    expect(initialKana(item({}))).toBe("");
  });

  it("moves to the next item, or back at the end", () => {
    expect(nextItemId(items, "a")).toBe("b");
    expect(nextItemId(items, "c")).toBe("b");
    expect(nextItemId([items[0]!], "a")).toBeUndefined();
  });
});
