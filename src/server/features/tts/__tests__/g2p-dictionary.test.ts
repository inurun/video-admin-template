import { describe, expect, it } from "vitest";
import type { DictionaryEntry } from "@/_schemas";
import { selectDictionaryHints } from "../g2p-dictionary";

const entries: DictionaryEntry[] = [
  {
    id: 1,
    kind: "fixed",
    surface: "GitHub",
    reading: "ギットハブ",
    accent_nucleus: 4,
    part_of_speech: "proper_noun",
    enabled: true,
  },
  {
    id: 2,
    kind: "fixed",
    surface: "下の方",
    reading: "シタノホウ",
    pronunciation: "シタノホー",
    accent_nucleus: 4,
    part_of_speech: "common_noun",
    enabled: true,
  },
  {
    id: 3,
    kind: "contextual",
    surface: "人気",
    enabled: true,
    candidates: [
      {
        description: "",
        examples: ["辺りには人気がない", "a", "b", "c"],
        morphemes: [
          { surface: "人気", reading: "ヒトケ", accent_nucleus: 0, part_of_speech: "common_noun" },
        ],
      },
      {
        description: "",
        examples: ["人気スポット"],
        morphemes: [
          { surface: "人気", reading: "ニンキ", accent_nucleus: 0, part_of_speech: "common_noun" },
        ],
      },
    ],
  },
  {
    id: 4,
    kind: "fixed",
    surface: "辺り",
    reading: "ヘン",
    accent_nucleus: 0,
    part_of_speech: "common_noun",
    enabled: false,
  },
];

describe("selectDictionaryHints", () => {
  it("picks enabled entries in the text, ignoring ASCII case", () => {
    expect(selectDictionaryHints(entries, "githubの下の方")).toEqual([
      { kind: "fixed", surface: "GitHub", reading: "ギットハブ", accent: 4 },
      { kind: "fixed", surface: "下の方", reading: "シタノホー", accent: 4 },
    ]);
  });

  it("lists contextual candidates with up to three examples", () => {
    expect(selectDictionaryHints(entries, "辺りには人気がない")).toEqual([
      {
        kind: "contextual",
        surface: "人気",
        candidates: [
          { reading: "ヒトケ", examples: ["辺りには人気がない", "a", "b"] },
          { reading: "ニンキ", examples: ["人気スポット"] },
        ],
      },
    ]);
  });
});
