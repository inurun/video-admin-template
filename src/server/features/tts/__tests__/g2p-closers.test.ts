import { describe, expect, it } from "vitest";
import { closerMismatchMessage } from "../g2p-closers";

describe("closerMismatchMessage", () => {
  it("accepts kana that follows the text punctuation", () => {
    expect(
      closerMismatchMessage("今日は、晴れ！", "今日:キョ'ー|は:ワ、晴れ:ハレ'！"),
    ).toBeUndefined();
    expect(closerMismatchMessage("1本、2本", "1本:イ'ッポン、2本:ニ'ホン")).toBeUndefined();
  });

  it("lets the sentence-final 。 be dropped or kept", () => {
    expect(closerMismatchMessage("晴れです。", "晴れ:ハ'レ|です:デス")).toBeUndefined();
    expect(closerMismatchMessage("晴れです。", "晴れ:ハ'レ|です:デス、")).toBeUndefined();
  });

  it("reads a question inside brackets and collapses repeated pauses", () => {
    expect(
      closerMismatchMessage(
        "「本当に？」って、……うん",
        "本当に:ホントーニ'？って:ッテ'、うん:ウ'ン",
      ),
    ).toBeUndefined();
  });

  it("rejects added, dropped, or replaced closers", () => {
    expect(
      closerMismatchMessage("強すぎ（笑）", "強すぎ:ツヨスギ'、（笑）:カッコワライ'"),
    ).toContain('expected "", got "、"');
    expect(closerMismatchMessage("えっと、何？", "えっと:エ'ット/何:ナ'ニ？")).toContain(
      'expected "、？", got "？"',
    );
    expect(closerMismatchMessage("本当？", "本当:ホントー'！")).toBeDefined();
  });
});
