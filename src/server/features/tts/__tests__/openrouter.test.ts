import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenRouterError } from "@/server/core/openrouter";
import { requestOpenRouterG2p } from "../openrouter";
import { LLM_G2P_PROFILE } from "../llm-g2p-profile";
import { OPENROUTER_G2P_REPAIR_PROMPT } from "../openrouter-prompt";

const env = { OPENROUTER_API_KEY: "key" };

const pages = [
  {
    id: "page-1",
    title: "Main",
    utterances: [{ id: "tts-1", text: "今日", target: true }],
  },
];

function successResponse(content: unknown) {
  return new Response(
    JSON.stringify({
      id: "generation-1",
      model: LLM_G2P_PROFILE.model,
      provider: "Google",
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 20,
        total_tokens: 120,
        cost: 0.001,
        completion_tokens_details: { reasoning_tokens: 8 },
        prompt_tokens_details: { cached_tokens: 12 },
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>) {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return JSON.parse(String(init.body));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("requestOpenRouterG2p", () => {
  it("sends pages with the one-shot profile and returns kana by id", async () => {
    const fetchMock = vi.fn(async () =>
      successResponse({ items: [{ id: "tts-1", kana: "今日:キョ'ー" }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestOpenRouterG2p(env, { kind: "generate", pages });

    expect(result.kanaById).toEqual(new Map([["tts-1", "今日:キョ'ー"]]));
    expect(result.usage).toEqual({
      promptTokens: 100,
      completionTokens: 20,
      reasoningTokens: 8,
      cachedTokens: 12,
      totalTokens: 120,
      costUsd: 0.001,
    });
    const body = requestBody(fetchMock);
    expect(body.model).toBe("google/gemini-4-argon");
    expect(body.reasoning).toEqual({ effort: "medium" });
    expect(body).not.toHaveProperty("temperature");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(JSON.parse(body.messages[1].content)).toEqual({ pages });
    expect(body.messages[0].content).not.toContain(OPENROUTER_G2P_REPAIR_PROMPT);
  });

  it("adds the repair prompt and sends items for repair", async () => {
    const fetchMock = vi.fn(async () => successResponse({ items: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const items = [
      {
        id: "tts-1",
        text: "今日",
        previousKana: "キョ'ー",
        errors: [{ reason: "missing_surface", message: "no surface" }],
      },
    ];

    await requestOpenRouterG2p(env, { kind: "repair", items });

    const body = requestBody(fetchMock);
    expect(body.messages[0].content).toContain(OPENROUTER_G2P_REPAIR_PROMPT);
    expect(JSON.parse(body.messages[1].content)).toEqual({ items });
  });

  it("retries 429 after Retry-After", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 429, headers: { "Retry-After": "2" } }))
      .mockResolvedValueOnce(successResponse({ items: [{ id: "tts-1", kana: "今日:キョ'ー" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const pending = requestOpenRouterG2p(env, { kind: "generate", pages });
    await vi.advanceTimersByTimeAsync(2000);

    await expect(pending).resolves.toMatchObject({ requestId: "generation-1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws on HTTP errors, invalid output, and a missing key", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("bad", { status: 400 }))
        .mockResolvedValueOnce(successResponse({ wrong: true })),
    );

    await expect(requestOpenRouterG2p(env, { kind: "generate", pages })).rejects.toMatchObject({
      status: 400,
    });
    await expect(requestOpenRouterG2p(env, { kind: "generate", pages })).rejects.toThrow(
      "invalid structured output",
    );
    await expect(requestOpenRouterG2p({}, { kind: "generate", pages })).rejects.toBeInstanceOf(
      OpenRouterError,
    );
  });
});
