import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyReadings,
  changedReadings,
  checkReadings,
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
  it("compares katakana moras with long vowel marks dropped", () => {
    expect(sameSound("オオキイ", "オーキー")).toBe(false);
    expect(sameSound("ソーキュー", "そうきゅう")).toBe(false);
    expect(sameSound("ソーキュー", "ソキュ")).toBe(true);
    expect(sameSound("さがく", "サガク")).toBe(true);
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

describe("checkReadings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("checks a chunk in one request with short ids and one recording per item", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                items: [
                  {
                    id: "1",
                    corrections: [
                      { index: 4, surface: "早急", heard: "サッキュー", correct: "サッキュー" },
                      { index: 99, surface: "?", heard: "ア", correct: "ア" },
                    ],
                  },
                  { id: "2", corrections: [] },
                  { id: "9", corrections: [] },
                ],
              }),
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const words = wordsOf(kana);
    const other = wordsOf("境内:ケ'イダイ");

    const result = await checkReadings({ OPENROUTER_API_KEY: "secret" }, [
      { id: "a", text: "出納係が、差額を早急に", words, wav: Buffer.from("RIFF-a") },
      { id: "b", text: "境内", words: other, wav: Buffer.from("RIFF-b") },
      { id: "c", text: "抜けた", words: other, wav: Buffer.from("RIFF-c") },
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
        text: JSON.stringify({
          items: [
            { id: "1", text: "出納係が、差額を早急に", words },
            { id: "2", text: "境内", words: other },
            { id: "3", text: "抜けた", words: other },
          ],
        }),
      },
      { type: "text", text: "recording 1" },
      audio("RIFF-a"),
      { type: "text", text: "recording 2" },
      audio("RIFF-b"),
      { type: "text", text: "recording 3" },
      audio("RIFF-c"),
    ]);
  });
});
