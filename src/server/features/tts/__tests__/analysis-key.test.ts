import { describe, expect, it } from "vitest";
import { createTtsAnalysisKey } from "../analysis-key";

const base = {
  projectPath: "project",
  pageId: "page-1",
  ttsId: "tts-1",
  provider: "voisona",
  text: "人気",
  effectiveReadText: "人気",
};

describe("createTtsAnalysisKey", () => {
  it("is stable for the same input", () => {
    expect(createTtsAnalysisKey(base)).toBe(createTtsAnalysisKey(base));
  });

  it("changes when text, readText, or provider changes", () => {
    const original = createTtsAnalysisKey(base);
    expect(createTtsAnalysisKey({ ...base, text: "人気です" })).not.toBe(original);
    expect(createTtsAnalysisKey({ ...base, effectiveReadText: "にんき" })).not.toBe(original);
    expect(createTtsAnalysisKey({ ...base, provider: "voicevox" })).not.toBe(original);
    expect(original).toMatch(/^[a-f0-9]{32}$/);
  });
});
