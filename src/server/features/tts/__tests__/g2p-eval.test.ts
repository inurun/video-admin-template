import { describe, expect, it } from "vitest";
import { compareKana, formatKanaProsody, isExactMatch, parseKanaProsody } from "../g2p-eval";

describe("parseKanaProsody", () => {
  it("drops surfaces and keeps moras, phrase spans and nuclei", () => {
    const prosody = parseKanaProsody("犬:イヌ'|が:ガ/水:ミズ|が:ガ'、今日:キョ'ー？");
    expect(prosody.moras).toEqual(["イ", "ヌ", "ガ", "ミ", "ズ", "ガ", "キョ", "ー"]);
    expect(prosody.phrases).toEqual([
      { start: 0, end: 3, accent: 2, closer: "/" },
      { start: 3, end: 6, accent: 3, closer: "、" },
      { start: 6, end: 8, accent: 1, closer: "？" },
    ]);
  });

  it("leaves the accent undefined when a phrase has no nucleus", () => {
    expect(parseKanaProsody("猫:ネコ").phrases[0]?.accent).toBeUndefined();
  });

  it("formats the prosody without surfaces", () => {
    expect(formatKanaProsody(parseKanaProsody("犬:イヌ'|が:ガ/水:ミズ|が:ガ'！"))).toBe(
      "イヌ'ガ/ミズガ'！",
    );
  });
});

describe("compareKana", () => {
  it("ignores word granularity in surfaces", () => {
    const comparison = compareKana("なんだ:ナ'ンダ|よ:ヨ", "なん:ナ'ン|だよ:ダヨ");
    expect(isExactMatch(comparison)).toBe(true);
  });

  it("stops at a reading mismatch", () => {
    expect(compareKana("人気:ヒトケ|が:ガ", "人気:ニンキ|が:ガ")).toEqual({ reading: false });
  });

  it("counts missing and extra boundaries", () => {
    expect(compareKana("今日:キョ'ー|は:ワ/晴れ:ハレ'", "今日:キョ'ー|は:ワ|晴れ:ハレ'")).toEqual({
      reading: true,
      boundaries: 1,
      missingBoundaries: 1,
      extraBoundaries: 0,
      alignedPhrases: 0,
      wrongAccents: 0,
    });
    expect(compareKana("天気予報:テンキヨ'ホー", "天気:テ'ンキ/予報:ヨホー'")).toMatchObject({
      missingBoundaries: 0,
      extraBoundaries: 1,
    });
  });

  it("compares nuclei of phrases with the same span", () => {
    expect(
      compareKana("起き:オ'キ|た:タ/犬:イヌ'|が:ガ", "起き:オキ'|た:タ/犬:イヌ'|が:ガ"),
    ).toEqual({
      reading: true,
      boundaries: 1,
      missingBoundaries: 0,
      extraBoundaries: 0,
      alignedPhrases: 2,
      wrongAccents: 1,
    });
  });
});
