import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createG2pItem } from "@/_schemas/__tests__/g2p-fixture";
import { HaqumeiApiError } from "@/server/features/haqumei-api/error";

const mocks = vi.hoisted(() => ({
  ttsDir: "",
  analyzeTexts: vi.fn(),
  /** Dictionary word indexes per analyzed item. */
  dictionaryWords: [] as number[][],
  validateG2pItem: vi.fn(),
  extractProsody: vi.fn(),
  synthesizeProsodySource: vi.fn(),
  checkReadings: vi.fn(),
}));

vi.mock("@/server/_shared/storage", () => ({
  getProjectTtsDir: (projectPath: string) => path.join(mocks.ttsDir, projectPath),
}));
vi.mock("@/server/features/haqumei-api/analyze", () => ({
  analyzeTextsWithDictionary: async (env: unknown, texts: string[]) =>
    ((await mocks.analyzeTexts(env, texts)) as unknown[]).map((g2p, index) => ({
      g2p,
      dictionaryWords: mocks.dictionaryWords[index] ?? [],
    })),
}));
vi.mock("@/server/features/haqumei-api/validate", () => ({
  validateG2pItem: mocks.validateG2pItem,
}));
vi.mock("@/server/features/haqumei-api/prosody", () => ({ extractProsody: mocks.extractProsody }));
vi.mock("../source", () => ({ synthesizeProsodySource: mocks.synthesizeProsodySource }));
vi.mock("../reading-check", async () => ({
  ...(await vi.importActual<typeof import("../reading-check")>("../reading-check")),
  checkReadings: mocks.checkReadings,
}));

import { analyzeProsody } from "../pipeline";
import type { ProsodySource } from "../source-config";
import { prosodyExtractPath, prosodySourcePath, readCachedProsody } from "../cache";

const env = { OPENROUTER_API_KEY: "secret" };
const source: ProsodySource = {
  id: "test-source",
  model: "elevenlabs/eleven-v4",
  voice: "bella",
  tag: "",
  sampleRate: 24_000,
};
const text = "早急に相殺した";
const context = { previous: "前の文。", next: "次の文。" };
const analyzed = createG2pItem(text, "早急:ソーキュー'|に:ニ/相殺:ソーサイ'|した:シタ");
const extract = {
  schema_version: "3",
  aligner_version: "mms-fa-1",
  score: 0.7,
  moras: [{ start: 0, vowel_start: 0.05, end: 0.1, log_f0: 5.4 }],
  pauses: [],
};

function wav(label: string) {
  return Buffer.from(`RIFF-${label}`);
}

/** Result of one batched check for the single target (item id "0"). */
function checked(corrections: unknown[]) {
  return new Map([["0", corrections]]);
}

describe("analyzeProsody", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.ttsDir = await fs.mkdtemp(path.join(os.tmpdir(), "prosody-"));
    mocks.analyzeTexts.mockResolvedValue([analyzed]);
    mocks.dictionaryWords = [];
    mocks.validateG2pItem.mockImplementation(async (_env, item) =>
      createG2pItem(item.text, item.kana),
    );
    mocks.extractProsody.mockResolvedValue(extract);
    mocks.synthesizeProsodySource.mockImplementation(async (_env, input: string) => wav(input));
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    warn.mockRestore();
    await fs.rm(mocks.ttsDir, { recursive: true, force: true });
  });

  it("keeps the analyzer kana when the recording matches and caches the source and extract", async () => {
    mocks.checkReadings.mockResolvedValueOnce(checked([]));

    await expect(analyzeProsody(env, "project", [{ readText: text, source }])).resolves.toEqual([
      { g2p: analyzed, prosody: extract },
    ]);
    expect(mocks.extractProsody).toHaveBeenCalledWith(env, analyzed, wav(text));
    expect(mocks.validateG2pItem).not.toHaveBeenCalled();
    await expect(fs.readFile(prosodySourcePath("project", analyzed, source))).resolves.toEqual(
      wav(text),
    );
    await expect(readCachedProsody("project", analyzed, source)).resolves.toEqual(extract);

    // A second run reuses the checked source: no TTS and no LLM.
    await analyzeProsody(env, "project", [{ readText: text, source }]);
    expect(mocks.synthesizeProsodySource).toHaveBeenCalledTimes(1);
    expect(mocks.checkReadings).toHaveBeenCalledTimes(1);
  });

  it("takes the heard reading where the analyzer was wrong", async () => {
    mocks.checkReadings.mockResolvedValueOnce(
      checked([{ index: 0, surface: "早急", heard: "サッキュー", correct: "サッキュー" }]),
    );
    const kana = "早急:サッキュー'|に:ニ/相殺:ソーサイ'|した:シタ";

    const [result] = await analyzeProsody(env, "project", [{ readText: text, source }]);

    expect(result).toEqual({ g2p: createG2pItem(text, kana), prosody: extract });
    expect(mocks.validateG2pItem).toHaveBeenCalledWith(env, { text, kana });
    expect(mocks.synthesizeProsodySource).toHaveBeenCalledTimes(1);
  });

  it("respells a word the recording misread and checks once more", async () => {
    mocks.checkReadings
      .mockResolvedValueOnce(
        checked([{ index: 2, surface: "相殺", heard: "ソーサツ", correct: "ソーサイ" }]),
      )
      .mockResolvedValueOnce(checked([]));

    const [result] = await analyzeProsody(env, "project", [{ readText: text, source }]);

    expect(mocks.synthesizeProsodySource).toHaveBeenNthCalledWith(
      2,
      env,
      "早急にソーサイした",
      source,
      undefined,
    );
    expect(mocks.extractProsody).toHaveBeenCalledWith(env, analyzed, wav("早急にソーサイした"));
    expect(result).toEqual({ g2p: analyzed, prosody: extract });
  });

  it("passes the context to the first reading and to the respelled one", async () => {
    mocks.checkReadings
      .mockResolvedValueOnce(
        checked([{ index: 2, surface: "相殺", heard: "ソーサツ", correct: "ソーサイ" }]),
      )
      .mockResolvedValueOnce(checked([]));

    await analyzeProsody(env, "project", [{ readText: text, source, context }]);

    expect(mocks.synthesizeProsodySource.mock.calls).toEqual([
      [env, text, source, context],
      [env, "早急にソーサイした", source, context],
    ]);
  });

  it("passes the context when reading an edited kana", async () => {
    const edited = createG2pItem(text, "早急:サッキュー'|に:ニ/相殺:ソーサイ'|した:シタ");

    await analyzeProsody(env, "project", [{ readText: text, g2p: edited, source, context }]);

    expect(mocks.synthesizeProsodySource).toHaveBeenCalledWith(
      env,
      "サッキューに相殺した",
      source,
      context,
    );
  });

  it("drops the prosody but keeps the correct reading when the retry still misreads", async () => {
    const misread = { index: 2, surface: "相殺", heard: "ソーサツ", correct: "ソーサイ" };
    mocks.checkReadings
      .mockResolvedValueOnce(checked([misread]))
      .mockResolvedValueOnce(checked([misread]));

    const [result] = await analyzeProsody(env, "project", [{ readText: text, source }]);

    expect(result).toEqual({ g2p: analyzed });
    expect(mocks.extractProsody).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("still misreads"));
    await expect(fs.access(prosodySourcePath("project", analyzed, source))).rejects.toThrow();
  });

  it("drops the prosody when the extract fails", async () => {
    mocks.checkReadings.mockResolvedValueOnce(checked([]));
    mocks.extractProsody.mockRejectedValueOnce(
      HaqumeiApiError.fromUnknown({ code: "alignment_failed", detail: "too short" }, 422),
    );

    await expect(analyzeProsody(env, "project", [{ readText: text, source }])).resolves.toEqual([
      { g2p: analyzed },
    ]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("extract failed"));
  });

  it("drops the prosody when the reference TTS fails", async () => {
    mocks.synthesizeProsodySource.mockRejectedValueOnce(new Error("HTTP 500"));

    await expect(analyzeProsody(env, "project", [{ readText: text, source }])).resolves.toEqual([
      { g2p: analyzed },
    ]);
    expect(mocks.checkReadings).not.toHaveBeenCalled();
  });

  it("checks the recordings of several utterances in one request", async () => {
    const texts = ["早急に相殺した", "出納係", "境内"];
    const items = texts.map((t) => createG2pItem(t, `${t}:ア'`));
    mocks.analyzeTexts.mockResolvedValueOnce(items);
    mocks.checkReadings.mockImplementationOnce(
      async (_env, chunk: { id: string }[]) => new Map(chunk.map((item) => [item.id, []])),
    );

    const results = await analyzeProsody(
      env,
      "project",
      texts.map((readText) => ({ readText, source })),
    );

    expect(mocks.checkReadings).toHaveBeenCalledTimes(1);
    const [, chunk] = mocks.checkReadings.mock.calls[0]!;
    expect(chunk.map((item: { text: string; wav: Buffer }) => [item.text, item.wav])).toEqual(
      texts.map((t) => [t, wav(t)]),
    );
    expect(results).toEqual(items.map((g2p) => ({ g2p, prosody: extract })));
  });

  it("drops the prosody of every item in a chunk whose check fails", async () => {
    const texts = ["早急に相殺した", "出納係"];
    const items = texts.map((t) => createG2pItem(t, `${t}:ア'`));
    mocks.analyzeTexts.mockResolvedValueOnce(items);
    mocks.checkReadings.mockRejectedValueOnce(new Error("HTTP 500"));

    await expect(
      analyzeProsody(
        env,
        "project",
        texts.map((readText) => ({ readText, source })),
      ),
    ).resolves.toEqual(items.map((g2p) => ({ g2p })));
    expect(mocks.extractProsody).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("drops the prosody of an item the check left out", async () => {
    mocks.checkReadings.mockResolvedValueOnce(new Map());

    await expect(analyzeProsody(env, "project", [{ readText: text, source }])).resolves.toEqual([
      { g2p: analyzed },
    ]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no result"));
  });

  it("respells edited readings for a saved kana without a reading check", async () => {
    const edited = createG2pItem(text, "早急:サッキュー'|に:ニ/相殺:ソーサイ'|した:シタ");

    await expect(
      analyzeProsody(env, "project", [{ readText: text, g2p: edited, source }]),
    ).resolves.toEqual([{ g2p: edited, prosody: extract }]);
    expect(mocks.synthesizeProsodySource).toHaveBeenCalledWith(
      env,
      "サッキューに相殺した",
      source,
      undefined,
    );
    expect(mocks.checkReadings).not.toHaveBeenCalled();
    expect(mocks.extractProsody).toHaveBeenCalledWith(env, edited, wav("サッキューに相殺した"));

    // An accent-only edit reuses the source and only extracts again.
    const accent = createG2pItem(text, "早急:サッキュー'|に:ニ/相殺:ソ'ーサイ|した:シタ");
    await analyzeProsody(env, "project", [{ readText: text, g2p: accent, source }]);
    expect(mocks.synthesizeProsodySource).toHaveBeenCalledTimes(1);
    expect(mocks.extractProsody).toHaveBeenLastCalledWith(env, accent, wav("サッキューに相殺した"));
  });

  it("reads dictionary words in katakana and keeps their reading through the check", async () => {
    mocks.dictionaryWords = [[2]];
    mocks.checkReadings.mockResolvedValueOnce(
      checked([{ index: 2, surface: "相殺", heard: "ソーサイ", correct: "ソーサツ" }]),
    );

    const [result] = await analyzeProsody(env, "project", [{ readText: text, source }]);

    expect(mocks.synthesizeProsodySource.mock.calls).toEqual([
      [env, "早急にソーサイした", source, undefined],
    ]);
    expect(mocks.checkReadings.mock.calls[0]![1][0]).toMatchObject({ text });
    expect(result).toEqual({ g2p: analyzed, prosody: extract });
  });

  it("keeps dictionary words in katakana when respelling a misread", async () => {
    mocks.dictionaryWords = [[2]];
    mocks.checkReadings
      .mockResolvedValueOnce(
        checked([{ index: 0, surface: "早急", heard: "ハヤキュー", correct: "ソーキュー" }]),
      )
      .mockResolvedValueOnce(checked([]));

    await analyzeProsody(env, "project", [{ readText: text, source }]);

    expect(mocks.synthesizeProsodySource).toHaveBeenLastCalledWith(
      env,
      "ソーキューにソーサイした",
      source,
      undefined,
    );
  });

  it("reads the dictionary words of a saved kana in katakana", async () => {
    mocks.dictionaryWords = [[2]];
    const edited = createG2pItem(text, "早急:サッキュー'|に:ニ/相殺:ソーサイ'|した:シタ");

    await analyzeProsody(env, "project", [{ readText: text, g2p: edited, source }]);

    expect(mocks.synthesizeProsodySource).toHaveBeenCalledWith(
      env,
      "サッキューにソーサイした",
      source,
      undefined,
    );
  });

  it("analyzes, reads and checks again when fresh, over the saved kana and caches", async () => {
    mocks.checkReadings.mockResolvedValue(checked([]));
    await analyzeProsody(env, "project", [{ readText: text, source }]);
    const edited = createG2pItem(text, "早急:サッキュー'|に:ニ/相殺:ソーサイ'|した:シタ");
    mocks.synthesizeProsodySource.mockResolvedValueOnce(wav("again"));

    const [result] = await analyzeProsody(
      env,
      "project",
      [{ readText: text, g2p: edited, source }],
      { fresh: true },
    );

    expect(result).toEqual({ g2p: analyzed, prosody: extract });
    expect(mocks.synthesizeProsodySource).toHaveBeenCalledTimes(2);
    expect(mocks.checkReadings).toHaveBeenCalledTimes(2);
    await expect(fs.readFile(prosodySourcePath("project", analyzed, source))).resolves.toEqual(
      wav("again"),
    );
  });
});

describe("prosody cache keys", () => {
  const base = createG2pItem(text, "早急:ソーキュー'|に:ニ/相殺:ソーサイ'|した:シタ");
  const accent = createG2pItem(text, "早急:ソ'ーキュー|に:ニ、相殺:ソーサイ'|した:シタ");
  const reading = createG2pItem(text, "早急:サッキュー'|に:ニ/相殺:ソーサイ'|した:シタ");

  it("shares the source across accent and phrase edits but not reading edits", () => {
    expect(prosodySourcePath("p", accent, source)).toBe(prosodySourcePath("p", base, source));
    expect(prosodySourcePath("p", reading, source)).not.toBe(prosodySourcePath("p", base, source));
    expect(prosodySourcePath("q", base, source)).not.toBe(prosodySourcePath("p", base, source));
  });

  it("keys the extract by the whole kana", () => {
    expect(prosodyExtractPath("p", accent, source)).not.toBe(prosodyExtractPath("p", base, source));
    expect(prosodyExtractPath("p", base, source)).toBe(
      prosodyExtractPath("p", createG2pItem(text, base.kana), source),
    );
  });
});
