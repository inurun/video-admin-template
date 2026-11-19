import { describe, expect, it } from "vitest";
import { katakanaSpell } from "../katakana";

const kana = "出納係:スイトーガカリ'|が:ガ、差額:サガク'|を:ヲ/早急:ソーキュー'|に:ニ";

describe("katakanaSpell", () => {
  it("spells only the given words in katakana", () => {
    const text = "出納係が、差額を早急に相殺した";
    expect(katakanaSpell(text, kana, new Map([[4, "さっきゅう"]]))).toBe(
      "出納係が、差額をサッキュウに相殺した",
    );
  });
});
