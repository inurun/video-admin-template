import { describe, expect, it } from "vitest";
import { createEditorSessionStore } from "@/app/features/editor/store/editor-session-store";
import {
  applyMarkSaved,
  applyUpdateTts,
  applyUpsertPage,
  buildSaveChangeSet,
  captureDirtySnapshot,
  hasDirtyChanges,
} from "@/app/features/editor/store/editor-session-state";
import {
  createSavedMainPage,
  createSavedOutroPage,
  createSavedProject,
  createSavedTts,
} from "./fixtures";

function pageFormTts() {
  return {
    id: "tts-1",
    provider: "voisona" as const,
    text: "Hello",
    readText: "Hello",
    voiceName: "voice",
    padBeforeSec: 0,
    padAfterSec: 0,
    volume: 1,
    speech: {},
  };
}

function pageFormValues(id: string, title: string) {
  return {
    id,
    title,
    type: "main" as const,
    meta: { tags: [] },
    padBeforeSec: 0,
    padAfterSec: 0,
    richText: "<p>Hello</p>",
    tts: [pageFormTts()],
  };
}

function outroBlock(id: string, url: string) {
  return {
    id,
    url,
    title: "",
    description: "",
    image: null,
    logo: null,
    favicon: null,
    author: "",
    date: "",
    publisher: "",
    lang: "",
    audio: null,
    video: null,
    iframe: "",
    feed: "",
    impression: "",
  };
}

function outroPageFormValues(id: string, urls: string[]) {
  return {
    id,
    title: "Outro",
    type: "outro" as const,
    meta: {
      tags: [],
      blocks: urls.map((url, index) => outroBlock(`block-${index + 1}`, url)),
    },
    padBeforeSec: 0,
    padAfterSec: 0,
    richText: null,
    tts: [],
  };
}

describe("editor session store", () => {
  it("does not notify another page selector when a different page is updated", () => {
    const store = createEditorSessionStore(
      createSavedProject({
        pages: [
          createSavedMainPage({ id: "page-a", title: "A" }),
          createSavedMainPage({
            id: "page-b",
            title: "B",
            tts: [createSavedTts({ id: "tts-b" })],
          }),
        ],
      }),
    );

    const pageB = store.getState().itemsById["page-b"];
    store.getState().upsertPage("page-a", pageFormValues("page-a", "A changed"));

    expect(store.getState().itemsById["page-b"]).toBe(pageB);
    expect(store.getState().itemsById["page-a"]).not.toBe(pageB);
  });

  it("does not change project settings when TTS is updated", () => {
    const store = createEditorSessionStore(createSavedProject());
    const project = store.getState().project;

    store.getState().updateTts("page-1", "tts-1", {
      ...pageFormTts(),
      text: "Changed",
    });

    expect(store.getState().project).toBe(project);
    const page = store.getState().itemsById["page-1"];
    expect(page && page.type !== "transition" ? page.tts[0]?.text : null).toBe("Changed");
  });

  it("builds a dirty change set for add, update, remove, and reorder", () => {
    const store = createEditorSessionStore(createSavedProject());
    store.getState().insertSequenceItem(pageFormValues("page-2", "Page 2"), 1);
    store.getState().updateTts("page-1", "tts-1", { ...pageFormTts(), text: "Updated" });
    store.getState().removeSequenceItem("page-2");
    store.getState().reorderSequence(["page-1"]);
    store.getState().updateProjectSettings({
      ...store.getState().project,
      meta: { ...store.getState().project.meta, title: "renamed" },
    });

    expect(buildSaveChangeSet(store.getState())).toEqual({
      project: store.getState().project,
      upsertItems: [store.getState().itemsById["page-1"]],
      removedItemIds: ["page-2"],
      sequenceOrder: ["page-1"],
    });
  });

  it("clears matching dirty versions on save success and keeps them on failure", () => {
    const store = createEditorSessionStore(createSavedProject());
    store.getState().updateTts("page-1", "tts-1", { ...pageFormTts(), text: "Updated" });

    const dirtyState = store.getState();
    expect(buildSaveChangeSet(dirtyState).upsertItems).toHaveLength(1);
    const snapshot = captureDirtySnapshot(dirtyState);
    expect(snapshot.itemIds["page-1"]).toBe(1);

    const failed = applyUpdateTts(dirtyState, "page-1", "tts-1", {
      ...pageFormTts(),
      text: "Updated again",
    });
    expect(failed.dirty.itemIds["page-1"]).toBe(2);

    store.getState().markSaved(snapshot);
    expect(store.getState().dirty.itemIds["page-1"]).toBeUndefined();
    expect(applyMarkSaved(failed, snapshot).dirty.itemIds["page-1"]).toBe(2);
  });

  it("keeps edits made during an in-flight save dirty", () => {
    const store = createEditorSessionStore(createSavedProject());
    store.getState().updateTts("page-1", "tts-1", { ...pageFormTts(), text: "first" });
    const inFlight = captureDirtySnapshot(store.getState());

    store.getState().updateTts("page-1", "tts-1", { ...pageFormTts(), text: "during save" });
    store.getState().updateProjectSettings({
      ...store.getState().project,
      meta: { ...store.getState().project.meta, title: "during save" },
    });
    store.getState().markSaved(inFlight);

    expect(store.getState().dirty.itemIds["page-1"]).toBe(2);
    expect(store.getState().dirty.project).toBe(1);
    expect(hasDirtyChanges(store.getState())).toBe(true);
    expect(buildSaveChangeSet(store.getState()).upsertItems[0]).toMatchObject({
      tts: [{ text: "during save" }],
    });
  });

  it("syncs the first page snapshot change without requiring a dirty flag", () => {
    const store = createEditorSessionStore(createSavedProject());
    const current = store.getState().itemsById["page-1"];
    if (!current || current.type === "transition") {
      throw new Error("expected page");
    }

    expect(applyUpsertPage(store.getState(), "page-1", current)).toBe(store.getState());

    const firstEdit = applyUpsertPage(store.getState(), "page-1", {
      ...current,
      title: "first keystroke",
    });
    expect(firstEdit).not.toBe(store.getState());
    expect(firstEdit.dirty.itemIds["page-1"]).toBe(1);
    expect(firstEdit.itemsById["page-1"]).toMatchObject({ title: "first keystroke" });

    const secondEdit = applyUpsertPage(firstEdit, "page-1", {
      ...current,
      title: "second keystroke",
    });
    expect(secondEdit.dirty.itemIds["page-1"]).toBe(2);
  });

  it("keeps invalid current page values until save validation", () => {
    const store = createEditorSessionStore(createSavedProject());
    const current = store.getState().itemsById["page-1"];
    if (!current || current.type === "transition") {
      throw new Error("expected page");
    }

    store.getState().upsertPage("page-1", { ...current, padBeforeSec: -1 });
    expect(store.getState().itemsById["page-1"]).toMatchObject({ padBeforeSec: -1 });
    expect(store.getState().dirty.itemIds["page-1"]).toBe(1);
  });

  it("keeps a later page dirty after saving an earlier page snapshot", () => {
    const store = createEditorSessionStore(
      createSavedProject({
        pages: [
          createSavedMainPage({ id: "page-a", title: "A" }),
          createSavedMainPage({ id: "page-b", title: "B", tts: [createSavedTts({ id: "tts-b" })] }),
        ],
      }),
    );

    store.getState().upsertPage("page-a", pageFormValues("page-a", "A edited"));
    const savedA = captureDirtySnapshot(store.getState());
    store.getState().upsertPage("page-b", pageFormValues("page-b", "B edited"));
    store.getState().markSaved(savedA);

    expect(store.getState().dirty.itemIds["page-a"]).toBeUndefined();
    expect(store.getState().dirty.itemIds["page-b"]).toBe(1);
  });

  it("includes forceResynthesis even when nothing else is dirty", () => {
    const store = createEditorSessionStore(createSavedProject());
    expect(buildSaveChangeSet(store.getState(), { forceResynthesis: true })).toEqual({
      upsertItems: [],
      removedItemIds: [],
      forceResynthesis: true,
    });
  });

  it("includes extra pages with failed tts even when the session is clean", () => {
    const store = createEditorSessionStore(
      createSavedProject({
        pages: [
          createSavedMainPage({ id: "page-1" }),
          createSavedMainPage({ id: "page-failed", tts: [createSavedTts({ id: "tts-failed" })] }),
        ],
      }),
    );

    expect(
      buildSaveChangeSet(store.getState(), { extraUpsertItemIds: ["page-failed"] }).upsertItems,
    ).toEqual([store.getState().itemsById["page-failed"]]);
  });

  it("merges niconico outro urls into parent work ids and keeps existing ids", () => {
    const store = createEditorSessionStore(
      createSavedProject({
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
            parentWorkIds: ["ss1"],
            fixedParentWorkIds: [],
            tags: [],
          },
        },
        pages: [createSavedOutroPage({ id: "outro-1" })],
      }),
    );

    store
      .getState()
      .upsertPage(
        "outro-1",
        outroPageFormValues("outro-1", [
          "https://www.nicovideo.jp/watch/sm9",
          "https://www.youtube.com/watch?v=abc",
        ]),
      );

    expect(store.getState().project.meta.niconico.parentWorkIds).toEqual(["ss1", "sm9"]);
    expect(store.getState().dirty.project).toBe(1);

    store
      .getState()
      .upsertPage(
        "outro-1",
        outroPageFormValues("outro-1", ["https://www.nicovideo.jp/watch/sm9"]),
      );
    expect(store.getState().dirty.project).toBe(1);
  });

  it("merges niconico parent work ids when inserting an outro page", () => {
    const store = createEditorSessionStore(createSavedProject());
    store
      .getState()
      .insertSequenceItem(
        outroPageFormValues("outro-2", ["https://www.nicovideo.jp/shorts/ss123"]),
        1,
      );

    expect(store.getState().project.meta.niconico.parentWorkIds).toEqual(["ss123"]);
    expect(store.getState().dirty.project).toBe(1);
  });

  it("does not merge parent work ids when updating a main page", () => {
    const store = createEditorSessionStore(
      createSavedProject({
        pages: [
          createSavedMainPage({ id: "page-1" }),
          createSavedOutroPage({
            id: "outro-1",
            meta: {
              tags: [],
              blocks: [outroBlock("block-1", "https://www.nicovideo.jp/watch/sm9")],
            },
          }),
        ],
      }),
    );

    store.getState().upsertPage("page-1", pageFormValues("page-1", "Changed"));
    expect(store.getState().project.meta.niconico.parentWorkIds).toEqual([]);
    expect(store.getState().dirty.project).toBe(0);
  });
});
