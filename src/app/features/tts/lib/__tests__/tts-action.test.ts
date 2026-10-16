import { describe, expect, it } from "vitest";
import type { TtsFormValues } from "@/app/features/tts/model/tts-form-schema";
import { canStartTtsAnalyze, isTtsActionReady } from "@/app/features/tts/lib/tts-action";

function createTts(overrides: Partial<TtsFormValues> = {}): TtsFormValues {
  return {
    id: "tts",
    provider: "voisona",
    text: "こんにちは",
    readText: "",
    voiceName: "voice",
    voiceVersion: "",
    padBeforeSec: 0,
    padAfterSec: 0,
    volume: 1,
    speech: {},
    ...overrides,
  } as TtsFormValues;
}

describe("isTtsActionReady", () => {
  it("accepts a runnable TTS item", () => {
    expect(isTtsActionReady(createTts(), true)).toBe(true);
  });

  it("rejects missing items and disabled commands", () => {
    expect(isTtsActionReady(undefined, true)).toBe(false);
    expect(isTtsActionReady(createTts(), false)).toBe(false);
  });

  it("requires text and voice name", () => {
    expect(isTtsActionReady(createTts({ text: "  " }), true)).toBe(false);
    expect(isTtsActionReady(createTts({ voiceName: "" }), true)).toBe(false);
  });
});

describe("canStartTtsAnalyze", () => {
  it("allows a second analyze while another TTS is in flight", () => {
    expect(canStartTtsAnalyze(createTts({ id: "tts-b" }), true, "page-1", new Set(["tts-a"]))).toBe(
      true,
    );
  });

  it("blocks a duplicate analyze for the same TTS", () => {
    expect(canStartTtsAnalyze(createTts({ id: "tts-a" }), true, "page-1", new Set(["tts-a"]))).toBe(
      false,
    );
  });

  it("rejects without a page", () => {
    expect(canStartTtsAnalyze(createTts(), true, null, new Set())).toBe(false);
  });

  it("rejects voicepeak", () => {
    expect(
      canStartTtsAnalyze(
        createTts({ id: "tts-a", provider: "voicepeak" }),
        true,
        "page-1",
        new Set(),
      ),
    ).toBe(false);
  });
});
