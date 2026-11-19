import { describe, expect, it } from "vitest";
import type { SavedMainPage } from "@/_schemas";
import { collectPageExpressions, expressionRates, selectExamples } from "../examples";

function tts(
  id: string,
  voiceName: string,
  text: string,
  avatar?: SavedMainPage["tts"][number]["avatar"],
) {
  return {
    id,
    text,
    provider: "voicevox" as const,
    voiceName,
    padBeforeSec: 0,
    padAfterSec: 0,
    volume: 1,
    speech: {},
    audio: { status: "idle" as const },
    avatar,
  };
}

function mainPage(items: ReturnType<typeof tts>[], avatars?: SavedMainPage["meta"]["avatars"]) {
  return {
    id: "page",
    type: "main",
    title: "回",
    padBeforeSec: 0,
    padAfterSec: 0,
    richText: null,
    meta: { tags: [], avatars },
    tts: items,
  } as SavedMainPage;
}

describe("collectPageExpressions", () => {
  it("records each turn with the turns before it and the first line's labels", () => {
    const history = collectPageExpressions(
      mainPage([tts("a", "demo", "一", { eyes: "shaded-opened" }), tts("b", "demo", "二")], {
        demo: { mouth: "closed" },
      }),
    );
    expect(history.turns).toEqual([
      { avatar: "demo", context: [], lines: ["一", "二"], eyes: "shaded-opened", mouth: "default" },
    ]);
    expect(history.bases).toEqual([]);
  });
});

describe("selectExamples", () => {
  it("takes the first records for each avatar, field and label", () => {
    const record = (line: string, eyes: string, mouth = "default") => ({
      avatar: "demo" as const,
      context: [],
      lines: [line],
      eyes,
      mouth,
    });
    const history = {
      turns: [
        record("1", "shaded-opened"),
        record("2", "shaded-opened"),
        record("3", "shaded-opened"),
        record("4", "default", "angry"),
        record("5", "default"),
        record("6", "default"),
      ],
      bases: [],
    };
    // 3 is full on eyes:shaded-opened and mouth:default; 6 is full on eyes:default too.
    expect(selectExamples(history, 2).turns.map((turn) => turn.lines[0])).toEqual([
      "1",
      "2",
      "4",
      "5",
    ]);
  });
});

describe("expressionRates", () => {
  it("shares labels per avatar and field", () => {
    const record = (eyes: string) => ({
      avatar: "demo" as const,
      context: [],
      lines: [],
      eyes,
      mouth: "default",
    });
    expect(
      expressionRates({
        turns: [record("shaded-opened"), record("default"), record("default")],
        bases: [],
      }),
    ).toEqual({
      demo: { eyes: { default: 0.667, "shaded-opened": 0.333 }, mouth: { default: 1 } },
    });
  });
});
