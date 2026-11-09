import { describe, expect, it } from "vitest";
import {
  CLICK_SUBMIT_SCRIPT,
  CONFIRM_STATE_SCRIPT,
  readSubmitToken,
  SUBMIT_TOKENS,
} from "../niconico-submit";

describe("niconico submit", () => {
  it("reads tokens from raw or JSON-quoted eval output", () => {
    expect(readSubmitToken(`${SUBMIT_TOKENS.clicked}\n`)).toBe(SUBMIT_TOKENS.clicked);
    expect(readSubmitToken(`"${SUBMIT_TOKENS.confirmClosed}"`)).toBe(SUBMIT_TOKENS.confirmClosed);
    expect(readSubmitToken("undefined")).toBeUndefined();
  });

  it("builds scripts that parse as expressions and target the confirmation dialog", () => {
    expect(() => new Function(`return ${CLICK_SUBMIT_SCRIPT};`)).not.toThrow();
    expect(() => new Function(`return ${CONFIRM_STATE_SCRIPT};`)).not.toThrow();
    expect(CLICK_SUBMIT_SCRIPT).toContain('"投稿の確認"');
    expect(CLICK_SUBMIT_SCRIPT).toContain('"投稿する"');
  });
});
