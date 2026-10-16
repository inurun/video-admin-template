import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTO_SAVE_DELAY } from "@/constants";
import { cancelScheduledAutoSave, watchAutoSave } from "../auto-save";
import { createEditorSessionStore } from "../../store/editor-session-store";
import { captureDirtySnapshot, hasDirtyChanges } from "../../store/editor-session-state";
import { createSavedProject } from "../../store/__tests__/fixtures";

describe("auto save", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(save = vi.fn(async () => {})) {
    const store = createEditorSessionStore(createSavedProject());
    const stop = watchAutoSave(store, save);
    const edit = () =>
      store.getState().updateProjectSettings({
        ...store.getState().project,
        meta: { ...store.getState().project.meta, title: String(Math.random()) },
      });
    return { store, stop, edit, save };
  }

  it("waits the auto-save delay after the latest edit and ignores clean sessions", async () => {
    const { edit, save, stop } = setup();
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY * 2);
    expect(save).not.toHaveBeenCalled();
    edit();
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY - 1_000);
    edit();
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY - 1);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    stop();
  });

  it("cancels the timer when manual or Zen saving starts", async () => {
    const { store, edit, save, stop } = setup();
    edit();
    cancelScheduledAutoSave(store);
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY * 2);
    expect(save).not.toHaveBeenCalled();
    stop();
  });

  it("keeps edits made during saving and does not postpone them on save reconciliation", async () => {
    const { store, edit, save, stop } = setup();
    edit();
    const saved = captureDirtySnapshot(store.getState());
    cancelScheduledAutoSave(store);
    edit();
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY / 2);
    store.getState().markSaved(saved);
    expect(hasDirtyChanges(store.getState())).toBe(true);
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY / 2);
    expect(save).toHaveBeenCalledTimes(1);
    store.getState().markSaved(captureDirtySnapshot(store.getState()));
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY * 2);
    expect(save).toHaveBeenCalledTimes(1);
    stop();
  });

  it("retains failures without retrying until another edit", async () => {
    const { store, edit, save, stop } = setup(
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    edit();
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY * 3);
    expect(save).toHaveBeenCalledTimes(1);
    expect(hasDirtyChanges(store.getState())).toBe(true);
    edit();
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY);
    expect(save).toHaveBeenCalledTimes(2);
    stop();
  });

  it("cancels old project timers on disposal", async () => {
    const { edit, save, stop } = setup();
    edit();
    stop();
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY);
    expect(save).not.toHaveBeenCalled();
  });
});
