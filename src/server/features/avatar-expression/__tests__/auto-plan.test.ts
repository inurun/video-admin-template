import { describe, expect, it } from "vitest";
import type { AvatarOverride, AvatarSource } from "@/_schemas";
import { isAutoOwned, planPageExpressions, resolveSavedAvatar } from "../auto-plan";
import { expressionTurnKey } from "../expression";

type Line = { id: string; text: string; avatar?: AvatarOverride; avatarSource?: AvatarSource };

const demo = (line: Line) => ({ provider: "voisona", voiceName: "demo", ...line });

const keyOf = (...lines: string[]) => expressionTurnKey("demo", lines);

const enabled = { enabled: true, isInFlight: () => false };

describe("planPageExpressions", () => {
  it("marks an auto-owned turn whose text changed as pending", () => {
    const planned = planPageExpressions(
      [demo({ id: "a", text: "一" }), demo({ id: "b", text: "二" })],
      new Map(),
      enabled,
    );
    const key = keyOf("一", "二");
    expect(planned.keys).toEqual([key]);
    expect(planned.tts.map((item) => item.avatarSource)).toEqual([
      { kind: "pending", key },
      { kind: "pending", key },
    ]);
  });

  it("leaves turns already done or failed for the current text", () => {
    const key = keyOf("一");
    for (const kind of ["auto", "failed"] as const) {
      const planned = planPageExpressions(
        [demo({ id: "a", text: "一", avatarSource: { kind, key } })],
        new Map(),
        enabled,
      );
      expect(planned.keys).toEqual([]);
      expect(planned.tts[0]!.avatarSource).toEqual({ kind, key });
    }
  });

  it("never touches a turn with a hand-set line", () => {
    const tts = [
      demo({ id: "a", text: "一" }),
      demo({
        id: "b",
        text: "二",
        avatar: { eyes: "shaded-opened" },
        avatarSource: { kind: "manual" },
      }),
    ];
    const planned = planPageExpressions(tts, new Map(), enabled);
    expect(planned.keys).toEqual([]);
    expect(planned.tts).toEqual(tts);
  });

  it("counts lines saved before auto with eyes or mouth as hand-set", () => {
    expect(isAutoOwned({ avatar: { eyes: "shaded-opened" } })).toBe(false);
    expect(isAutoOwned({ avatar: { base: "normal" } })).toBe(true);
    expect(isAutoOwned({})).toBe(true);
  });

  it("does not restart a pending turn whose job is still running", () => {
    const key = keyOf("一");
    const planned = planPageExpressions(
      [demo({ id: "a", text: "一", avatarSource: { kind: "pending", key } })],
      new Map(),
      { enabled: true, isInFlight: (inFlight) => inFlight === key },
    );
    expect(planned.keys).toEqual([]);
    expect(planned.tts[0]!.avatarSource).toEqual({ kind: "pending", key });
  });

  it("turns pending into failed without an LLM", () => {
    const planned = planPageExpressions(
      [demo({ id: "a", text: "一", avatarSource: { kind: "pending", key: "old" } })],
      new Map(),
      { enabled: false, isInFlight: () => false },
    );
    expect(planned.keys).toEqual([]);
    expect(planned.tts[0]!.avatarSource).toEqual({ kind: "failed", key: "old" });
  });
});

describe("resolveSavedAvatar", () => {
  const key = keyOf("一");
  const onDisk = {
    avatar: { eyes: "shaded-opened" },
    avatarSource: { kind: "auto", key } as AvatarSource,
  };

  it("takes the result on disk the client has not received yet", () => {
    const received: Line = { id: "a", text: "一" };
    const pending: Line = { id: "a", text: "一", avatarSource: { kind: "pending", key } };
    expect(resolveSavedAvatar(received, onDisk, key)).toEqual({ ...received, ...onDisk });
    expect(resolveSavedAvatar(pending, onDisk, key)).toEqual({ ...received, ...onDisk });
  });

  it("keeps a hand edit or a client auto result for the current text", () => {
    const manual: Line = { id: "a", text: "一", avatarSource: { kind: "manual" } };
    expect(resolveSavedAvatar(manual, onDisk, key)).toBe(manual);
    const button: Line = {
      id: "a",
      text: "一",
      avatar: { eyes: "opened" },
      avatarSource: { kind: "auto", key },
    };
    expect(resolveSavedAvatar(button, onDisk, key)).toBe(button);
  });
});
