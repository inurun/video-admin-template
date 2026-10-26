import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedProject, SavedTts } from "@/_schemas";
import { expressionTurnKey } from "@/server/features/avatar-expression/expression";

const { predictMock, readSavedProjectMock, writeSavedProjectMock } = vi.hoisted(() => ({
  predictMock: vi.fn(),
  readSavedProjectMock: vi.fn(),
  writeSavedProjectMock: vi.fn(),
}));

vi.mock("@/server/_shared/storage", () => ({
  readSavedProject: readSavedProjectMock,
  readSavedProjectDocument: vi.fn(async () => ({ timeline: undefined })),
  writeSavedProject: writeSavedProjectMock,
}));
vi.mock("@/server/features/avatar-expression/use-case", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/server/features/avatar-expression/use-case")>();
  return { ...original, predictExpressions: predictMock };
});

import {
  flushExpressionJobsForTests,
  planSavedPageExpressions,
  resetExpressionJobsForTests,
  startExpressionJobs,
} from "../avatar-expression-jobs";
import { buildExpressionTurns } from "@/server/features/avatar-expression/use-case";
import { resetProjectMutationQueueForTests } from "../project-mutation-queue";

const env = { OPENROUTER_API_KEY: "key" };

function tts(id: string, text: string, extra: Partial<SavedTts> = {}): SavedTts {
  return {
    id,
    provider: "voisona",
    voiceName: "demo",
    text,
    padBeforeSec: 0,
    padAfterSec: 0,
    volume: 1,
    speech: {},
    audio: { status: "idle" },
    ...extra,
  } as SavedTts;
}

function project(lines: SavedTts[]): SavedProject {
  return {
    meta: {
      title: "project",
      description: "",
      width: 1920,
      height: 1080,
      weather: {},
      niconico: {
        title: "",
        description: "",
        thumbnailTime: "00:00.000",
        parentWorkIds: [],
        tags: [],
      },
    },
    bgm: [],
    voicePresets: {},
    pages: [
      {
        id: "page",
        title: "",
        type: "main",
        meta: { tags: [] },
        padBeforeSec: 0,
        padAfterSec: 0,
        richText: null,
        tts: lines,
      },
    ],
  } as SavedProject;
}

function savedLines() {
  const written = writeSavedProjectMock.mock.calls[0]?.[1] as SavedProject | undefined;
  const page = written?.pages[0];
  return page && page.type !== "transition" ? page.tts : undefined;
}

beforeEach(() => {
  predictMock.mockImplementation(async (_env, input) => {
    const turns = buildExpressionTurns(input.tts);
    return {
      turns,
      picks: { bases: {}, turns: { t1: { eyes: "shaded-opened", mouth: "default" } } },
      usage: {},
    };
  });
});

afterEach(() => {
  vi.clearAllMocks();
  resetExpressionJobsForTests();
  resetProjectMutationQueueForTests();
});

describe("avatar expression jobs", () => {
  it("writes the pick into a turn still pending for the same text", async () => {
    const key = expressionTurnKey("demo", ["一"]);
    const planned = planSavedPageExpressions(
      env,
      "p",
      project([tts("a", "一")]).pages[0]! as never,
      new Map(),
    );
    expect(planned.target).toEqual({ pageId: "page", keys: [key] });
    readSavedProjectMock.mockResolvedValue(
      project([tts("a", "一", { avatarSource: { kind: "pending", key } })]),
    );

    startExpressionJobs(env, "p", [planned.target!]);
    await flushExpressionJobsForTests();

    expect(savedLines()?.[0]).toMatchObject({
      avatar: { eyes: "shaded-opened" },
      avatarSource: { kind: "auto", key },
    });
  });

  it("drops the result when the text changed while it ran", async () => {
    const key = expressionTurnKey("demo", ["一"]);
    readSavedProjectMock.mockResolvedValue(
      project([
        tts("a", "二", {
          avatarSource: { kind: "pending", key: expressionTurnKey("demo", ["二"]) },
        }),
      ]),
    );

    startExpressionJobs(env, "p", [{ pageId: "page", keys: [key] }]);
    await flushExpressionJobsForTests();

    expect(writeSavedProjectMock).not.toHaveBeenCalled();
  });

  it("marks the turn failed when the LLM call fails", async () => {
    const key = expressionTurnKey("demo", ["一"]);
    readSavedProjectMock.mockResolvedValue(
      project([tts("a", "一", { avatarSource: { kind: "pending", key } })]),
    );
    predictMock.mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    startExpressionJobs(env, "p", [{ pageId: "page", keys: [key] }]);
    await flushExpressionJobsForTests();

    expect(savedLines()?.[0]?.avatarSource).toEqual({ kind: "failed", key });
  });
});
