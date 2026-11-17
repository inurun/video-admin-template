import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyReadings,
  changedReadings,
  checkReadings,
  correctionsFromLines,
  kanaLine,
  respell,
  sameSound,
  wordsOf,
} from "../reading-check";

const kana = "出納係:スイトーガカリ'|が:ガ、差額:サガク'|を:ヲ/早急:ソーキュー'|に:ニ";

describe("wordsOf", () => {
  it("numbers words across phrases and drops accent marks", () => {
    expect(wordsOf(kana)).toEqual([
      { index: 0, surface: "出納係", reading: "スイトーガカリ" },
      { index: 1, surface: "が", reading: "ガ" },
      { index: 2, surface: "差額", reading: "サガク" },
      { index: 3, surface: "を", reading: "ヲ" },
      { index: 4, surface: "早急", reading: "ソーキュー" },
      { index: 5, surface: "に", reading: "ニ" },
    ]);
  });
});

describe("respell", () => {
  it("spells only the given words in katakana", () => {
    const text = "出納係が、差額を早急に相殺した";
    expect(respell(text, wordsOf(kana), new Map([[4, "さっきゅう"]]))).toBe(
      "出納係が、差額をサッキュウに相殺した",
    );
  });
});

describe("applyReadings", () => {
  it("keeps the nucleus offset of a changed word", () => {
    expect(applyReadings(kana, new Map([[4, "サッキュー"]]))).toBe(
      "出納係:スイトーガカリ'|が:ガ、差額:サガク'|を:ヲ/早急:サッキュー'|に:ニ",
    );
    expect(applyReadings("境内:ケ'ーナイ|の:ノ", new Map([[0, "ケイダイ"]]))).toBe(
      "境内:ケ'イダイ|の:ノ",
    );
  });

  it("leaves unchanged words as they are", () => {
    expect(applyReadings(kana, new Map())).toBe(kana);
  });
});

describe("sameSound", () => {
  it("spells long vowel marks as the vowel before them", () => {
    expect(sameSound("オオキイ", "オーキー")).toBe(true);
    expect(sameSound("ソーキュー", "ソオキュウ")).toBe(true);
    expect(sameSound("さがく", "サガク")).toBe(true);
  });

  it("tells readings apart by their mora count", () => {
    expect(sameSound("オーケ", "オーケー")).toBe(false);
    expect(sameSound("ソーキュー", "ソキュ")).toBe(false);
    expect(sameSound("ソーキュー", "そうきゅう")).toBe(false);
  });
});

describe("changedReadings", () => {
  it("finds words read differently from the analyzer by surface", () => {
    const edited = "出納係:シュツノーガカリ'|が:ガ、差額:サガク'|を:ヲ/早急:ソーキュー'|に:ニ";
    expect(changedReadings(wordsOf(edited), wordsOf(kana))).toEqual(
      new Map([[0, "シュツノーガカリ"]]),
    );
  });

  it("treats a word the analyzer split differently as changed", () => {
    expect(changedReadings(wordsOf("本当に:ホント'ニ"), wordsOf("本当:ホント'|に:ニ"))).toEqual(
      new Map([[0, "ホントニ"]]),
    );
  });
});

describe("kanaLine", () => {
  it("spaces words and punctuation and drops accent marks", () => {
    expect(kanaLine(kana)).toBe(
      "出納係:スイトーガカリ が:ガ 、 差額:サガク を:ヲ 早急:ソーキュー に:ニ",
    );
  });
});

describe("correctionsFromLines", () => {
  const words = wordsOf("頭:アタマ'|が:ガ、頭:アタマ'|の:ノ/中:チュウ");

  it("matches words by position, so a repeated surface stays apart", () => {
    expect(
      correctionsFromLines(
        words,
        "頭:アタマ が:ガ 、 頭:アトモ の:ノ 中:チュウ",
        "頭:アタマ が:ガ 、 頭:アタマ の:ノ 中:ナカ",
      ),
    ).toEqual([
      { index: 2, surface: "頭", heard: "アトモ", correct: "アタマ" },
      { index: 4, surface: "中", heard: "チュウ", correct: "ナカ" },
    ]);
  });

  it("ignores a spelling that sounds the same", () => {
    expect(
      correctionsFromLines(
        words,
        "頭:アタマ が:ガ 頭:アタマ の:ノ 中:チュウ",
        "頭:アタマ が:ガ 頭:アタマ の:ノ 中:チュー",
      ),
    ).toEqual([]);
  });

  it("accepts words split or joined differently when they read the same", () => {
    const split = wordsOf("今日:キョー|は:ワ/だ:ダ|まし:マシ/かじゃ:カジャ");
    expect(
      correctionsFromLines(
        split,
        "今日:キョー は:ワ だまし:ダマシ か:カ じゃ:ジャ",
        "今日:キョー は:ワ だまし:ダマシ か:カ じゃ:ジャ",
      ),
    ).toEqual([]);
    expect(
      correctionsFromLines(
        split,
        "今日:キョー は:ワ だまし:ダマシ か:カ じゃ:ジャ",
        "今日:キョー は:ワ だまし:ダマシ か:ケ じゃ:ジャ",
      ),
    ).toEqual([{ index: 4, surface: "かじゃ", heard: "カジャ", correct: "ケジャ" }]);
    expect(
      correctionsFromLines(
        split,
        "今日:キョー は:ワ だまし:ダマシイ かじゃ:カジャ",
        "今日:キョー は:ワ だまし:ダマシ かじゃ:カジャ",
      ),
    ).toBeUndefined();
  });

  it("gives up on lines with other words", () => {
    expect(
      correctionsFromLines(
        words,
        "頭:アタマ が:ガ 頭:アタマ の:ノ",
        "頭:アタマ が:ガ 頭:アタマ の:ノ",
      ),
    ).toBeUndefined();
    expect(
      correctionsFromLines(
        words,
        "頭:アタマ が:ガ 頭:アタマ の:ノ 中:ナカ",
        "頭:アタマ が:ガ 頭:アタマ の:ノ 仲:ナカ",
      ),
    ).toBeUndefined();
  });
});

describe("checkReadings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends each utterance next to its recording and reads back the differing lines", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                items: [
                  {
                    id: "1",
                    heard: "出納係:スイトーガカリ が:ガ 、 差額:サガク を:ヲ 早急:サッキュー に:ニ",
                    correct:
                      "出納係:スイトーガカリ が:ガ 、 差額:サガク を:ヲ 早急:サッキュー に:ニ",
                  },
                  { id: "2", heard: null, correct: null },
                  { id: "3", heard: "抜け:ヌケ", correct: "抜け:ヌケ" },
                  { id: "9", heard: null, correct: null },
                ],
              }),
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkReadings({ OPENROUTER_API_KEY: "secret" }, [
      { id: "a", text: "出納係が、差額を早急に", kana, wav: Buffer.from("RIFF-a") },
      { id: "b", text: "境内", kana: "境内:ケ'イダイ", wav: Buffer.from("RIFF-b") },
      { id: "c", text: "抜けた", kana: "抜けた:ヌケタ'", wav: Buffer.from("RIFF-c") },
    ]);

    expect(result).toEqual(
      new Map([
        ["a", [{ index: 4, surface: "早急", heard: "サッキュー", correct: "サッキュー" }]],
        ["b", []],
      ]),
    );
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      model: "google/gemini-3.8-flash",
      reasoning: { effort: "low" },
      response_format: { json_schema: { name: "readings", strict: true } },
    });
    const audio = (data: string) => ({
      type: "input_audio",
      input_audio: { data: Buffer.from(data).toString("base64"), format: "wav" },
    });
    expect(body.messages[1].content).toEqual([
      {
        type: "text",
        text: "#1\ntext: 出納係が、差額を早急に\nkana: 出納係:スイトーガカリ が:ガ 、 差額:サガク を:ヲ 早急:ソーキュー に:ニ",
      },
      audio("RIFF-a"),
      { type: "text", text: "#2\ntext: 境内\nkana: 境内:ケイダイ" },
      audio("RIFF-b"),
      { type: "text", text: "#3\ntext: 抜けた\nkana: 抜けた:ヌケタ" },
      audio("RIFF-c"),
    ]);
  });
});
