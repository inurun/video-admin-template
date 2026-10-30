import { describe, expect, it } from "vitest";
import { toCandidates } from "../use-case";

describe("toCandidates", () => {
  it("merges kana with the same prosody and ranks by count", () => {
    expect(
      toCandidates(["犬:イヌ'|が:ガ", "水:ミズ|が:ガ'", "いぬ:イヌ'|が:ガ", "犬が:イヌ'ガ"], {
        alternatives: [],
      }),
    ).toEqual([
      { kana: "犬:イヌ'|が:ガ", prosody: "イヌ'ガ", count: 3, status: "other" },
      { kana: "水:ミズ|が:ガ'", prosody: "ミズガ'", count: 1, status: "other" },
    ]);
  });

  it("drops runs without kana", () => {
    expect(toCandidates(["", ""], { alternatives: [] })).toEqual([]);
  });

  it("marks the truth and accepted alternatives by prosody", () => {
    const candidates = toCandidates(["犬:イヌ'", "犬:イ'ヌ", "猫:ネコ'"], {
      kana: "いぬ:イヌ'",
      alternatives: ["いぬ:イ'ヌ"],
    });
    expect(candidates.map(({ status }) => status)).toEqual(["truth", "alternative", "other"]);
  });
});
