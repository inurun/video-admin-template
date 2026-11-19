import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listSavedProjectsMock, writeFileMock } = vi.hoisted(() => ({
  listSavedProjectsMock: vi.fn(),
  writeFileMock: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({ default: { mkdir: vi.fn(), writeFile: writeFileMock } }));
vi.mock("@/server/_shared/storage", () => ({
  listSavedProjects: listSavedProjectsMock,
  readSavedProjectFile: vi.fn(),
}));

import { generateAvatarExpressions } from "../use-case";

const env = { OPENROUTER_API_KEY: "key" };

function respond(content: unknown) {
  return new Response(
    JSON.stringify({
      id: "generation-1",
      model: "openai/gpt-6-luna",
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.0001 },
    }),
    { status: 200 },
  );
}

const page = {
  title: "",
  tts: [
    { id: "a", text: "してねーよ！", provider: "voisona", voiceName: "demo" },
    { id: "b", text: "ほんとに", provider: "voisona", voiceName: "demo" },
  ],
};

beforeEach(() => {
  listSavedProjectsMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("generateAvatarExpressions", () => {
  it("asks per turn and writes the pick back to each line", async () => {
    const fetchMock = vi.fn(async () =>
      respond({ bases: [], turns: [{ id: "t1", eyes: "shaded-opened", mouth: "default" }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateAvatarExpressions(env, { projectPath: "2026-10-26", page });

    expect(result.tts.map(({ avatarSource: _source, ...item }) => item)).toEqual([
      { id: "a", avatar: { eyes: "shaded-opened" } },
      { id: "b", avatar: { eyes: "shaded-opened" } },
    ]);
    expect(result.tts.map((item) => item.avatarSource.kind)).toEqual(["auto", "auto"]);
    expect(result.tts[0]!.avatarSource).toEqual(result.tts[1]!.avatarSource);
    expect(result.avatars).toEqual({});

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.reasoning).toEqual({ effort: "none" });
    expect(JSON.parse(body.messages[1].content).turns).toEqual([
      { id: "t1", avatar: "demo", lines: ["してねーよ！", "ほんとに"] },
    ]);
    expect(
      body.response_format.json_schema.schema.properties.turns.items.properties.id.enum,
    ).toEqual(["t1"]);
    expect(writeFileMock).toHaveBeenCalledOnce();
  });

  it("falls back to default for an option the character does not have", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond({ bases: [], turns: [{ id: "t1", eyes: "jitome", mouth: "x" }] })),
    );

    const result = await generateAvatarExpressions(env, { projectPath: "2026-10-26", page });

    expect(result.tts.map((item) => item.avatar)).toEqual([null, null]);
  });

  it("skips the LLM when the page has no lines", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateAvatarExpressions(env, {
      projectPath: "2026-10-26",
      page: { title: "", tts: [] },
    });

    expect(result).toEqual({ avatars: {}, tts: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
