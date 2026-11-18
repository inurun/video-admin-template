import { describe, expect, it } from "vitest";
import { splitKanaMoras } from "@/_schemas";
import { fishPhrasePhonemes, phonemeSpell } from "../fish-phonemes";

const phrase = (kana: string, accent?: number) => fishPhrasePhonemes(splitKanaMoras(kana), accent);
const ph = (phonemes: string) => `<|phoneme_start|>${phonemes}<|phoneme_end|>`;

describe("fishPhrasePhonemes", () => {
  it("tells 箸が, 橋が and 端が apart by pitch, as in Fish's examples", () => {
    expect(phrase("ハシガ", 1)).toBe("ha1shi0ga0");
    expect(phrase("ハシガ", 2)).toBe("ha0shi1ga0");
    // A mark after the last mora is a flat phrase.
    expect(phrase("ハシガ", 3)).toBe("ha0shi1ga1");
    expect(phrase("ハシガ")).toBe("ha0shi1ga1");
  });

  it("writes ッ as cl without a digit, ン as N, and ー as the vowel before it", () => {
    expect(phrase("サッキューニ", 4)).toBe("sa0clkyu1u1ni0");
    expect(phrase("キャンペーン", 3)).toBe("kya0N1pe1e0N0");
  });

  it("reads special moras", () => {
    expect(phrase("ティーシャツ", 1)).toBe("ti1i0sha0tsu0");
    expect(phrase("フォーク", 1)).toBe("fo1o0ku0");
    expect(phrase("ジャズ", 1)).toBe("ja1zu0");
    expect(phrase("ヲ", 1)).toBe("o1");
  });

  it("gives up on a mora it has no phoneme for", () => {
    expect(phrase("ンー", 1)).toBeUndefined();
    expect(phrase("ABC", 1)).toBeUndefined();
  });
});

describe("phonemeSpell", () => {
  const text = "早急に相殺した";
  const kana = "早急:ソーキュー'|に:ニ/相殺:ソーサイ'|した:シタ";

  it("replaces the whole accent phrase of a given word, with its new reading", () => {
    expect(phonemeSpell(text, kana, new Map([[0, "サッキュー"]]))).toBe(
      `${ph("sa0clkyu1u1ni0")}相殺した`,
    );
    expect(phonemeSpell(text, kana, new Map([[2, "ソーサイ"]]))).toBe(
      `早急に${ph("so0o1sa1i1shi0ta0")}`,
    );
  });

  it("keeps punctuation and the words of other phrases", () => {
    const sentence = "猫が、窓から外を見ている！";
    const words = "猫:ネ'コ|が:ガ、窓:マ'ド|から:カラ/外:ソ'ト|を:ヲ/見:ミ'|て:テ|いる:イル！";
    expect(phonemeSpell(sentence, words, new Map([[2, "マド"]]))).toBe(
      `猫が、${ph("ma1do0ka0ra0")}外を見ている！`,
    );
  });

  it("falls back to katakana words when a phrase has no phonemes", () => {
    expect(phonemeSpell("ABCです", "ABC:エービーシー|です:デ'ス", new Map([[0, "ABC"]]))).toBe(
      "ABCです",
    );
  });

  it("leaves the text alone without readings", () => {
    expect(phonemeSpell(text, kana, new Map())).toBe(text);
  });
});
