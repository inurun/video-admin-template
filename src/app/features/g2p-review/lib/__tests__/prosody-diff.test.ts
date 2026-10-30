import { describe, expect, it } from "vitest";
import { diffProsody } from "../prosody-diff";

describe("diffProsody", () => {
  it("marks phrases missing from the base", () => {
    expect(diffProsody("イ'ヌガ/ミズガ'？", "イヌ'ガ/ミズガ'！")).toEqual([
      { text: "イ'ヌガ/", changed: true },
      { text: "ミズガ'？", changed: false },
    ]);
  });
});
