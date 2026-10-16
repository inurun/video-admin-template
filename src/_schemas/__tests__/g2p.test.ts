import { describe, expect, it } from "vitest";
import { g2pItemSchema } from "../g2p";
import { createG2pItem } from "./g2p-fixture";

describe("g2pItemSchema", () => {
  it("accepts a valid item", () => {
    expect(g2pItemSchema.parse(createG2pItem("こんにちは", "コンニチワ'")).kana).toBe(
      "コンニチワ'",
    );
  });

  it("strips dictionary_words from an Analyze response item", () => {
    expect(
      g2pItemSchema.parse({
        text: "雨衣",
        kana: "雨衣:アメコロ'",
        warnings: [],
        dictionary_words: [{ word_index: 0, kind: "fixed" }],
      }),
    ).toEqual({ text: "雨衣", kana: "雨衣:アメコロ'", warnings: [] });
  });

  it("rejects a source_span outside the UTF-16 text", () => {
    const item = createG2pItem("ab");
    item.warnings = [
      {
        code: "unknown_word",
        source_span: { start_utf16: 0, end_utf16: 4 },
      },
    ];

    expect(g2pItemSchema.safeParse(item).success).toBe(false);
  });

  it("accepts a source_span that matches JS string indexes around emoji", () => {
    const text = "A𰻞B";
    const item = createG2pItem(text);
    item.warnings = [
      {
        code: "unknown_word",
        source_span: { start_utf16: 1, end_utf16: 3 },
      },
    ];

    expect(g2pItemSchema.parse(item).warnings[0]?.source_span).toEqual({
      start_utf16: 1,
      end_utf16: 3,
    });
    expect(text.slice(1, 3)).toBe("𰻞");
  });

  it("accepts an unknown boundary warning without a source_span", () => {
    const text = "前⋯後";
    const item = createG2pItem(text);
    item.warnings = [
      {
        code: "unknown_word",
        source_span: { start_utf16: 1, end_utf16: 2 },
      },
    ];

    const warning = g2pItemSchema.parse(item).warnings[0];
    const span = warning?.source_span;
    expect(span).toEqual({ start_utf16: 1, end_utf16: 2 });
    expect(span && text.slice(span.start_utf16, span.end_utf16)).toBe("⋯");
  });
});
