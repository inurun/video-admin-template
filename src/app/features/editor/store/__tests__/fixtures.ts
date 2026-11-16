import type { SavedPage, SavedProject, SavedTts } from "@/_schemas";

export function createSavedTts(
  overrides: Partial<Extract<SavedTts, { provider: "voisona" }>> = {},
): SavedTts {
  return {
    id: "tts-1",
    provider: "voisona",
    text: "Hello",
    readText: "Hello",
    voiceName: "voice",
    padBeforeSec: 0,
    padAfterSec: 0,
    volume: 1,
    audio: { status: "ready", src: "/tts/hello.wav", durationSec: 1 },
    speech: {},
    ...overrides,
  };
}

export function createSavedOutroPage(
  overrides: Partial<Extract<SavedPage, { type: "outro" }>> = {},
): SavedPage {
  return {
    id: "outro-1",
    title: "Outro",
    type: "outro",
    meta: { tags: [], blocks: [] },
    padBeforeSec: 0,
    padAfterSec: 0,
    richText: null,
    tts: [],
    ...overrides,
  };
}

export function createSavedMainPage(
  overrides: Partial<Extract<SavedPage, { type: "main" }>> = {},
): SavedPage {
  return {
    id: "page-1",
    title: "Page 1",
    type: "main",
    meta: { tags: [] },
    padBeforeSec: 0,
    padAfterSec: 0,
    richText: "<p>Hello</p>",
    tts: [createSavedTts()],
    ...overrides,
  };
}

export function createSavedProject(overrides: Partial<SavedProject> = {}): SavedProject {
  return {
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
        parentWorkIds: [],
        fixedParentWorkIds: [],
        tags: [],
      },
    },
    bgm: [],
    voicePresets: {},
    pages: [createSavedMainPage()],
    ...overrides,
  };
}
