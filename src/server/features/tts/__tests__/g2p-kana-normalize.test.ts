import { describe, expect, it } from "vitest";
import { normalizeLlmKana } from "../g2p-kana-normalize";

describe("normalizeLlmKana", () => {
  it("collapses repeated pauses written for ……", () => {
    expect(normalizeLlmKana("なんか:ナ'ンカ、、")).toBe("なんか:ナ'ンカ、");
    expect(normalizeLlmKana("まあ:マ'ー、、あの:アノ'")).toBe("まあ:マ'ー、あの:アノ'");
  });

  it("drops a trailing slash", () => {
    expect(normalizeLlmKana("いや:イ'ヤ/")).toBe("いや:イ'ヤ");
    expect(normalizeLlmKana("そっか:ソ'ッカ/そっか:ソ'ッカ/")).toBe(
      "そっか:ソ'ッカ/そっか:ソ'ッカ",
    );
  });

  it("moves an accent mark written on the surface to the end of the reading", () => {
    expect(normalizeLlmKana("検証:ケンショー/し:シ|て:テ|た':タ")).toBe(
      "検証:ケンショー/し:シ|て:テ|た:タ'",
    );
    expect(normalizeLlmKana("AI:エーアイ|だ':ダ|し:シ")).toBe("AI:エーアイ|だ:ダ'|し:シ");
  });

  it("leaves valid kana and accent errors it cannot judge unchanged", () => {
    const valid = "猫:ネ'コ|が:ガ/窓:マ'ド|から:カラ/外:ソ'ト|を:ヲ/見:ミ'|て:テ|いる:イル！";
    expect(normalizeLlmKana(valid)).toBe(valid);
    expect(normalizeLlmKana("時間:ジカン'|ある:ア'ル")).toBe("時間:ジカン'|ある:ア'ル");
    expect(normalizeLlmKana("た':タ'")).toBe("た':タ'");
  });
});
