import { beforeEach, describe, expect, it, vi } from "vitest";
import { createG2pItem } from "@/_schemas/__tests__/g2p-fixture";

const { files } = vi.hoisted(() => ({ files: new Map<string, string>() }));

vi.mock("node:fs/promises", () => ({
  default: {
    mkdir: vi.fn(),
    readFile: vi.fn(async (filePath: string) => {
      const content = files.get(filePath);
      if (content === undefined) {
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      }
      return content;
    }),
    writeFile: vi.fn(async (filePath: string, content: string) => {
      files.set(filePath, content);
    }),
  },
}));

import { dictionaryHash, findCachedG2p, readG2pCache, recordG2pCache } from "../g2p-cache";

const hint = { kind: "fixed" as const, surface: "雨衣", reading: "アメコロ", accent: 0 };

beforeEach(() => {
  files.clear();
});

describe("g2p cache", () => {
  it("starts empty and keeps what was recorded", async () => {
    expect(await readG2pCache()).toEqual({ entries: {} });

    await recordG2pCache([
      {
        provider: "voicevox",
        text: "雨衣",
        entry: {
          source: "llm",
          g2p: createG2pItem("雨衣", "雨衣:アメコロ'"),
          dictionaryHash: dictionaryHash([hint]),
        },
      },
    ]);

    const cache = await readG2pCache();
    const utterance = { id: "a", text: "雨衣", target: true, provider: "voicevox" as const };
    expect(findCachedG2p(cache, { ...utterance, dictionary: [hint] })?.kana).toBe("雨衣:アメコロ'");
    expect(findCachedG2p(cache, utterance)).toBeUndefined();
    expect(findCachedG2p(cache, { ...utterance, provider: "voisona" })).toBeUndefined();
  });

  it("uses a saved reading whatever the dictionary and never replaces it with an LLM one", async () => {
    await recordG2pCache([
      {
        provider: "voicevox",
        text: "ポ",
        entry: { source: "saved", g2p: createG2pItem("ポ", "ポ:ポ'") },
      },
    ]);
    await recordG2pCache([
      {
        provider: "voicevox",
        text: "ポ",
        entry: { source: "llm", g2p: createG2pItem("ポ", "ポ:ポ"), dictionaryHash: "x" },
      },
    ]);

    const cache = await readG2pCache();
    expect(
      findCachedG2p(cache, {
        id: "a",
        text: "ポ",
        target: true,
        provider: "voicevox",
        dictionary: [hint],
      })?.kana,
    ).toBe("ポ:ポ'");
  });
});
