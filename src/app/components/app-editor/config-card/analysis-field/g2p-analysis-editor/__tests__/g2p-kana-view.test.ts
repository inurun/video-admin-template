import { describe, expect, it } from "vitest";
import {
  parseKanaView,
  serializeKanaView,
  setPhraseAccent,
  togglePhraseChain,
} from "../g2p-kana-view";

const SAMPLE = "イチ'ジ|ニ/ヒトトキ|ノ|キューソク'";

describe("g2p-kana-view", () => {
  it("round-trips a validated kana string", () => {
    const phrases = parseKanaView(SAMPLE);
    expect(phrases).toMatchObject([
      {
        words: [{ moras: ["イ", "チ", "ジ"] }, { moras: ["ニ"] }],
        accent: 2,
        closer: "slash",
      },
      {
        words: [
          { moras: ["ヒ", "ト", "ト", "キ"] },
          { moras: ["ノ"] },
          { moras: ["キュ", "ー", "ソ", "ク"] },
        ],
        accent: 0,
        closer: "end",
      },
    ]);
    expect(serializeKanaView(phrases!)).toBe(SAMPLE);
  });

  it("moves the accent nucleus and maps trailing quote to Flat", () => {
    const phrases = parseKanaView(SAMPLE);
    expect(setPhraseAccent(phrases!, 0, 1)).toBe("イ'チジ|ニ/ヒトトキ|ノ|キューソク'");
    expect(setPhraseAccent(phrases!, 0, 0)).toBe("イチジ|ニ'/ヒトトキ|ノ|キューソク'");
    expect(setPhraseAccent(phrases!, 1, 4)).toBe("イチ'ジ|ニ/ヒトトキ'|ノ|キューソク");
  });

  it("splits and merges chained words without crossing pause", () => {
    const phrases = parseKanaView(SAMPLE);
    const split = togglePhraseChain(phrases!, 0, 1);
    expect(split).toBe("イチ'ジ/ニ'/ヒトトキ|ノ|キューソク'");
    const merged = togglePhraseChain(parseKanaView(split!)!, 1, 0);
    expect(merged).toBe(SAMPLE);

    const withPause = parseKanaView("ア'、イ'");
    expect(togglePhraseChain(withPause!, 1, 0)).toBeNull();
  });

  it("keeps v3 surfaces through accent and chain edits", () => {
    const kana = "今日:キョ'ー|は:ワ/いい:イ'イ/天気:テ'ンキ|です:デス|ね:ネ！";
    const phrases = parseKanaView(kana);
    expect(phrases?.[0]?.words).toEqual([
      { surface: "今日", moras: ["キョ", "ー"] },
      { surface: "は", moras: ["ワ"] },
    ]);
    expect(serializeKanaView(phrases!)).toBe(kana);
    expect(setPhraseAccent(phrases!, 1, 0)).toBe(
      "今日:キョ'ー|は:ワ/いい:イイ'/天気:テ'ンキ|です:デス|ね:ネ！",
    );
    expect(togglePhraseChain(phrases!, 2, 1)).toBe(
      "今日:キョ'ー|は:ワ/いい:イ'イ/天気:テ'ンキ/です:デス|ね:ネ'！",
    );
  });

  it("rejects an empty surface", () => {
    expect(parseKanaView(":ア'")).toBeNull();
  });
});
