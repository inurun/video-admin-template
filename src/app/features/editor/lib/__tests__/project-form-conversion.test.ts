import { describe, expect, it } from "vitest";
import {
  mergeSavedSpeechIntoPageForm,
  mergeUneditedSavedSpeechIntoPageForm,
  toPageFormValues,
  toTtsFormValues,
} from "@/app/features/editor/lib/project-form-conversion";
import {
  createSavedMainPage,
  createSavedTts,
} from "@/app/features/editor/store/__tests__/fixtures";
import { createG2pItem } from "@/_schemas/__tests__/g2p-fixture";

describe("page form values", () => {
  it("converts only the selected saved page into page form values", () => {
    const page = createSavedMainPage({
      id: "page-a",
      title: "A",
      tts: [createSavedTts({ id: "tts-a", text: "Hello" })],
    });

    expect(toPageFormValues(page)).toEqual({
      id: "page-a",
      title: "A",
      type: "main",
      meta: { tags: [] },
      padBeforeSec: 0,
      padAfterSec: 0,
      richText: "<p>Hello</p>",
      tts: [toTtsFormValues(page.tts[0]!)],
    });
    expect(toPageFormValues(page)).not.toHaveProperty("durationSec");
    expect(toPageFormValues(page).tts[0]).not.toHaveProperty("audio");
  });

  it("keeps comments snapshot and groups when converting a comments page", () => {
    const page = {
      id: "comments-1",
      title: "Comments",
      type: "comments" as const,
      meta: {
        tags: ["niconico"],
        niconico: { videoId: "sm1", fetchedAt: "2026-09-16T00:00:00.000Z" },
        presentation: "single" as const,
      },
      comments: [
        {
          id: "sm1:thread:main:1",
          threadId: "thread",
          fork: "main" as const,
          no: 1,
          body: "うぽつ",
          vposMs: 0,
          postedAt: "2026-09-16T00:00:00.000Z",
          hidden: false,
        },
      ],
      commentGroups: [
        {
          id: "g1",
          commentIds: ["sm1:thread:main:1"],
          displayText: null,
          ttsIds: ["r1", "t1"],
        },
      ],
      commentScenes: [{ id: "s1", groupIds: ["g1"] }],
      padBeforeSec: 0,
      padAfterSec: 0,
      richText: null,
      tts: [
        createSavedTts({ id: "r1", text: "うぽつ" }),
        createSavedTts({ id: "t1", text: "ありがとう" }),
      ],
      durationSec: 9,
    };

    const form = toPageFormValues(page);
    expect(form).toMatchObject({
      type: "comments",
      comments: page.comments,
      commentGroups: page.commentGroups,
      commentScenes: page.commentScenes,
      meta: page.meta,
    });
    expect(form).not.toHaveProperty("durationSec");
    expect(form.tts.map((item) => item.id)).toEqual(["r1", "t1"]);
  });

  it("merges saved speech onto matching TTS ids without using index or persistence fields", () => {
    const first = createG2pItem("first");
    const second = createG2pItem("second");
    const current = toPageFormValues(
      createSavedMainPage({
        tts: [
          createSavedTts({ id: "tts-b", text: "B" }),
          createSavedTts({ id: "tts-a", text: "A" }),
        ],
      }),
    );
    const saved = toPageFormValues(
      createSavedMainPage({
        tts: [
          createSavedTts({ id: "tts-a", text: "A", speech: { g2p: first } }),
          createSavedTts({ id: "tts-b", text: "B", speech: { g2p: second } }),
        ],
      }),
    );

    const merged = mergeSavedSpeechIntoPageForm(current, saved);
    expect(merged.tts.map((item) => item.id)).toEqual(["tts-b", "tts-a"]);
    expect(merged.tts[0]?.speech?.g2p).toBe(second);
    expect(merged.tts[1]?.speech?.g2p).toBe(first);
    expect(merged).not.toHaveProperty("durationSec");
    expect(merged.tts[0]).not.toHaveProperty("audio");
  });

  it("applies polled g2p only when the form still matches the previous saved kana", () => {
    const baseline = createG2pItem("ここを出よ", "ココ|ヲ'/ダ|ヨ'");
    const corrected = createG2pItem("ここを出よ", "ココ|ヲ'/デ|ヨ'");
    const previous = createSavedMainPage({
      tts: [createSavedTts({ speech: { g2p: baseline } })],
    });
    const current = toPageFormValues(previous);
    const next = createSavedMainPage({
      tts: [createSavedTts({ speech: { g2p: corrected } })],
    });

    expect(mergeUneditedSavedSpeechIntoPageForm(current, previous, next).tts[0]?.speech?.g2p).toBe(
      corrected,
    );

    const edited = {
      ...current,
      tts: [
        { ...current.tts[0]!, speech: { g2p: createG2pItem("ここを出よ", "ココ'|ヲ/デ'|ヨ") } },
      ],
    };
    expect(mergeUneditedSavedSpeechIntoPageForm(edited, previous, next)).toBe(edited);
    expect(mergeUneditedSavedSpeechIntoPageForm(current, previous, previous)).toBe(current);
  });
});
