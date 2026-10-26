import { describe, expect, it } from "vitest";
import { applyExpressions, type ExpressionTurn } from "../apply";

const turns: ExpressionTurn[] = [
  { id: "t1", avatarType: "demo", items: [{ id: "a" }, { id: "b" }] },
];

describe("applyExpressions", () => {
  it("spreads the pick over every line of a turn", () => {
    const applied = applyExpressions({
      avatars: undefined,
      turns,
      picks: { bases: {}, turns: { t1: { eyes: "shaded-opened", mouth: "default" } } },
    });
    expect(applied.tts).toEqual([
      { id: "a", avatar: { eyes: "shaded-opened" } },
      { id: "b", avatar: { eyes: "shaded-opened" } },
    ]);
    expect(applied.avatars).toEqual({});
  });

  it("removes overrides when default is picked and keeps only differences from the page", () => {
    const applied = applyExpressions({
      avatars: { demo: { eyes: "shaded-opened" } },
      turns: [{ id: "t1", avatarType: "demo", items: [{ id: "a", avatar: { eyes: "opened" } }] }],
      picks: { turns: { t1: { eyes: "shaded-opened", mouth: "default" } } },
    });
    expect(applied.avatars).toEqual({ demo: { eyes: "shaded-opened" } });
    expect(applied.tts).toEqual([{ id: "a", avatar: undefined }]);
  });
});
