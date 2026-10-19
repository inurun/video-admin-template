import { beforeEach, describe, expect, it, vi } from "vitest";
import { createG2pItem } from "@/_schemas/__tests__/g2p-fixture";
import { HaqumeiApiError } from "@/server/features/haqumei-api/error";
import { LLM_G2P_PROFILE } from "../llm-g2p-profile";
import { ZERO_USAGE } from "../openrouter";
import type { G2pPageContext } from "../g2p-context";

const {
  analyzeTextsMock,
  listDictionaryMock,
  mkdirMock,
  requestG2pMock,
  validateG2pItemsMock,
  writeFileMock,
} = vi.hoisted(() => ({
  analyzeTextsMock: vi.fn(),
  listDictionaryMock: vi.fn(),
  mkdirMock: vi.fn(),
  requestG2pMock: vi.fn(),
  validateG2pItemsMock: vi.fn(),
  writeFileMock: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  default: { mkdir: mkdirMock, writeFile: writeFileMock },
}));
vi.mock("@/server/features/haqumei-api/analyze", () => ({ analyzeTexts: analyzeTextsMock }));
vi.mock("@/server/features/haqumei-api/validate", () => ({
  validateG2pItems: validateG2pItemsMock,
}));
vi.mock("@/server/features/dictionary/use-case", () => ({ listDictionary: listDictionaryMock }));
vi.mock("../openrouter", async (importOriginal) => {
  const original = await importOriginal<typeof import("../openrouter")>();
  return { ...original, requestOpenRouterG2p: requestG2pMock };
});

import { generateG2p } from "../llm-g2p";

const env = { OPENROUTER_API_KEY: "key" };

function page(texts: Record<string, string>, nonTarget: Record<string, string> = {}) {
  return [
    {
      id: "page-1",
      title: "Main",
      utterances: [
        ...Object.entries(texts).map(([id, text]) => ({ id, text, target: true })),
        ...Object.entries(nonTarget).map(([id, text]) => ({ id, text, target: false })),
      ],
    },
  ] satisfies G2pPageContext[];
}

function llmResult(kana: Record<string, string>) {
  return {
    requestId: "generation-1",
    model: "google/gemini-4-argon",
    kanaById: new Map(Object.entries(kana)),
    usage: ZERO_USAGE,
  };
}

function echoValidate() {
  validateG2pItemsMock.mockImplementation(async (_env, items: { text: string; kana: string }[]) =>
    items.map((item) => createG2pItem(item.text, item.kana)),
  );
}

function invalidAt(index: number, reason: string) {
  return new HaqumeiApiError({
    type: "about:blank",
    title: "Invalid G2P",
    status: 422,
    code: "invalid_g2p",
    detail: "",
    errors: [{ path: `items[${index}].kana`, reason, message: `${reason} message` }],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  listDictionaryMock.mockResolvedValue({ revision: 1, entries: [] });
});

describe("generateG2p", () => {
  it("uses LLM kana that passes validate", async () => {
    requestG2pMock.mockResolvedValueOnce(llmResult({ a: "今日:キョ'ー" }));
    echoValidate();

    const result = await generateG2p(env, {
      mode: "page",
      pages: page({ a: "今日" }, { b: "前" }),
    });

    expect(result.get("a")).toEqual({ g2p: createG2pItem("今日", "今日:キョ'ー"), source: "llm" });
    expect(analyzeTextsMock).not.toHaveBeenCalled();
    expect(requestG2pMock.mock.calls[0]?.[1]).toEqual({
      kind: "generate",
      pages: page({ a: "今日" }, { b: "前" }),
    });
    expect(writeFileMock).toHaveBeenCalledOnce();
  });

  it("repairs only the item that failed validate", async () => {
    requestG2pMock
      .mockResolvedValueOnce(llmResult({ a: "今日:キョ'ー", b: "キョ'ー" }))
      .mockResolvedValueOnce(llmResult({ b: "今日:キョ'ー" }));
    validateG2pItemsMock
      .mockRejectedValueOnce(invalidAt(1, "missing_surface"))
      .mockImplementation(async (_env, items: { text: string; kana: string }[]) =>
        items.map((item) => createG2pItem(item.text, item.kana)),
      );

    const result = await generateG2p(env, {
      mode: "page",
      pages: page({ a: "今日", b: "今日" }),
    });

    expect(requestG2pMock.mock.calls[1]?.[1]).toEqual({
      kind: "repair",
      items: [
        {
          id: "b",
          text: "今日",
          previousKana: "キョ'ー",
          errors: [{ reason: "missing_surface", message: "missing_surface message" }],
        },
      ],
    });
    expect(result.get("a")?.source).toBe("llm");
    expect(result.get("b")).toEqual({ g2p: createG2pItem("今日", "今日:キョ'ー"), source: "llm" });
  });

  it("sends a closer mismatch to repair", async () => {
    requestG2pMock
      .mockResolvedValueOnce(llmResult({ a: "強すぎ:ツヨスギ'、笑:ワライ'" }))
      .mockResolvedValueOnce(llmResult({ a: "強すぎ:ツヨスギ'/笑:ワライ'" }));
    echoValidate();

    const result = await generateG2p(env, { mode: "page", pages: page({ a: "強すぎ（笑）" }) });

    expect(requestG2pMock.mock.calls[1]?.[1].items[0].errors[0].reason).toBe("closer_mismatch");
    expect(result.get("a")?.g2p.kana).toBe("強すぎ:ツヨスギ'/笑:ワライ'");
  });

  it("normalizes format slips instead of sending them to repair", async () => {
    requestG2pMock.mockResolvedValueOnce(llmResult({ a: "えーと:エ'ート、、", b: "いや:イ'ヤ/" }));
    echoValidate();

    const result = await generateG2p(env, {
      mode: "page",
      pages: page({ a: "えーと……", b: "いや" }),
    });

    expect(requestG2pMock).toHaveBeenCalledOnce();
    expect(result.get("a")?.g2p.kana).toBe("えーと:エ'ート、");
    expect(result.get("b")?.g2p.kana).toBe("いや:イ'ヤ");
  });

  it("falls back to analyze when repair also fails or the LLM errors", async () => {
    requestG2pMock
      .mockResolvedValueOnce(llmResult({ a: "x" }))
      .mockResolvedValueOnce(llmResult({ a: "y" }));
    validateG2pItemsMock.mockRejectedValue(invalidAt(0, "invalid_kana_syntax"));
    analyzeTextsMock.mockResolvedValueOnce([createG2pItem("今日", "今日:キョ'ー")]);

    const result = await generateG2p(env, { mode: "single", pages: page({ a: "今日" }) });

    expect(result.get("a")).toEqual({
      g2p: createG2pItem("今日", "今日:キョ'ー"),
      source: "analyze",
    });
    expect(analyzeTextsMock).toHaveBeenCalledWith(env, ["今日"]);

    requestG2pMock.mockRejectedValueOnce(new Error("down"));
    analyzeTextsMock.mockResolvedValueOnce([createG2pItem("今日", "今日:キョ'ー")]);
    const down = await generateG2p(env, { mode: "page", pages: page({ a: "今日" }) });
    expect(down.get("a")?.source).toBe("analyze");
  });

  it("uses analyze without calling the LLM when there is no API key", async () => {
    analyzeTextsMock.mockResolvedValueOnce([createG2pItem("今日", "今日:キョ'ー")]);

    const result = await generateG2p({}, { mode: "page", pages: page({ a: "今日" }) });

    expect(result.get("a")?.source).toBe("analyze");
    expect(requestG2pMock).not.toHaveBeenCalled();
  });

  it("splits pages into chunks but keeps one request in single mode", async () => {
    const texts = Object.fromEntries(
      Array.from({ length: LLM_G2P_PROFILE.chunkSize + 1 }, (_, i) => [`t${i}`, "あ"]),
    );
    requestG2pMock.mockImplementation(async (_env, request) =>
      llmResult(
        Object.fromEntries(
          request.pages[0].utterances
            .filter((utterance: { target: boolean }) => utterance.target)
            .map((utterance: { id: string }) => [utterance.id, "あ:ア'"]),
        ),
      ),
    );
    echoValidate();

    await generateG2p(env, { mode: "page", pages: page(texts) });
    expect(requestG2pMock).toHaveBeenCalledTimes(2);

    requestG2pMock.mockClear();
    await generateG2p(env, { mode: "single", pages: page(texts) });
    expect(requestG2pMock).toHaveBeenCalledTimes(1);
  });

  it("attaches dictionary hints to target utterances only", async () => {
    listDictionaryMock.mockResolvedValueOnce({
      revision: 1,
      entries: [
        {
          id: 1,
          kind: "fixed",
          surface: "雨衣",
          reading: "アメコロ",
          accent_nucleus: 0,
          part_of_speech: "proper_noun",
          enabled: true,
        },
      ],
    });
    requestG2pMock.mockResolvedValueOnce(llmResult({ a: "雨衣:アメコロ'" }));
    echoValidate();

    await generateG2p(env, { mode: "page", pages: page({ a: "雨衣" }, { b: "雨衣" }) });

    expect(requestG2pMock.mock.calls[0]?.[1].pages[0].utterances).toEqual([
      {
        id: "a",
        text: "雨衣",
        target: true,
        dictionary: [{ kind: "fixed", surface: "雨衣", reading: "アメコロ", accent: 0 }],
      },
      { id: "b", text: "雨衣", target: false },
    ]);
  });
});
