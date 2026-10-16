import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTO_SAVE_DELAY } from "@/constants";
import { schedulePageZenApply } from "../schedule-page-zen-apply";
import { createBlankPageInput } from "@/app/features/page/lib/page-draft";

describe("page Zen auto Apply", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const page = createBlankPageInput({ id: "intro", title: "", type: "intro" });
  function input() {
    return {
      enabled: true,
      source: "@speaker\nhello",
      appliedSource: "",
      parsed: { pages: [page], errors: [] },
      apply: vi.fn(() => true),
      save: vi.fn(async () => {}),
    };
  }
  it("applies after the auto-save delay and saves immediately afterwards", async () => {
    const options = input();
    schedulePageZenApply(options);
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY - 1);
    expect(options.apply).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(options.apply).toHaveBeenCalledTimes(1);
    expect(options.save).toHaveBeenCalledTimes(1);
    expect(options.apply.mock.invocationCallOrder[0]).toBeLessThan(
      options.save.mock.invocationCallOrder[0],
    );
  });
  it("cancels pending input on Close or page switch", async () => {
    const options = input();
    const cancel = schedulePageZenApply(options);
    cancel?.();
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY);
    expect(options.apply).not.toHaveBeenCalled();
    expect(options.save).not.toHaveBeenCalled();
  });
  it("suppresses unchanged, closed, empty, invalid and multiple-page input", async () => {
    for (const override of [
      { enabled: false },
      { appliedSource: "@speaker\nhello" },
      { source: " " },
      { parsed: { pages: [], errors: [{ line: 1, message: "error" }] } },
      { parsed: { pages: [page, page], errors: [] } },
    ]) {
      const options = { ...input(), ...override };
      schedulePageZenApply(options);
      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY);
      expect(options.apply).not.toHaveBeenCalled();
    }
  });
  it("does not save when the current page no longer accepts Apply", async () => {
    const options = { ...input(), apply: vi.fn(() => undefined) };
    schedulePageZenApply(options);
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY);
    expect(options.save).not.toHaveBeenCalled();
  });
  it("resets the deadline on edits and does not retry failed saving", async () => {
    const options = {
      ...input(),
      save: vi.fn(async () => {
        throw new Error("offline");
      }),
    };
    const cancel = schedulePageZenApply(options);
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY - 1_000);
    cancel?.();
    schedulePageZenApply({ ...options, source: "changed" });
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY - 1);
    expect(options.apply).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY * 2 + 1);
    expect(options.save).toHaveBeenCalledTimes(1);
  });
});
