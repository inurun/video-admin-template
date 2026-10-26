import { describe, expect, it } from "vitest";
import {
  groupAvatarTurns,
  isAutoValue,
  minimizeOverride,
  mouthFamily,
  toExpressionLabels,
} from "../expression";

const demo = { provider: "voisona", voiceName: "demo" };

describe("avatar expression values", () => {
  it("reads the mouth family from opened / closed options", () => {
    expect(mouthFamily("angry-opened")).toBe("angry");
    expect(mouthFamily("3-closed")).toBe("3");
    expect(mouthFamily("opened")).toBe("default");
  });

  it("labels only options with a meaning", () => {
    expect(
      toExpressionLabels("demo", { base: "normal", eyes: "shaded-opened", mouth: "opened" }),
    ).toEqual({ base: "default", eyes: "shaded-opened", mouth: "default" });
  });

  it("lets auto replace unset, default and meaningful values", () => {
    expect(isAutoValue("demo", "eyes", undefined)).toBe(true);
    expect(isAutoValue("demo", "eyes", "opened")).toBe(true);
    expect(isAutoValue("demo", "eyes", "shaded-opened")).toBe(true);
    expect(isAutoValue("demo", "mouth", "closed")).toBe(true);
  });

  it("groups consecutive lines of one avatar into a turn", () => {
    const turns = groupAvatarTurns([
      { id: "a", ...demo },
      { id: "b", ...demo },
    ]);
    expect(turns.map((turn) => [turn.avatarType, turn.items.map((item) => item.id)])).toEqual([
      ["demo", ["a", "b"]],
    ]);
  });

  it("drops override fields equal to the inherited appearance", () => {
    const inherited = { base: "normal", eyes: "shaded-opened", mouth: "opened" };
    expect(minimizeOverride({ eyes: "shaded-opened", mouth: "closed" }, inherited)).toEqual({
      mouth: "closed",
    });
    expect(minimizeOverride({ eyes: "shaded-opened" }, inherited)).toBeUndefined();
  });
});
