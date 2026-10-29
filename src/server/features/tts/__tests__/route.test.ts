import { describe, expect, it, vi } from "vitest";
import { ttsApp } from "../route";
import { createG2pItem } from "@/_schemas/__tests__/g2p-fixture";
import { HaqumeiApiError } from "@/server/features/haqumei-api/error";

const {
  generateTtsG2pMock,
  clearTtsCacheMock,
  listTtsVoicesMock,
  synthesizeTtsMock,
  validateTtsG2pMock,
} = vi.hoisted(() => ({
  generateTtsG2pMock: vi.fn(),
  clearTtsCacheMock: vi.fn(),
  listTtsVoicesMock: vi.fn(),
  synthesizeTtsMock: vi.fn(),
  validateTtsG2pMock: vi.fn(),
}));

vi.mock("../use-case", () => ({
  generateTtsG2p: generateTtsG2pMock,
  clearTtsCache: clearTtsCacheMock,
  listTtsVoices: listTtsVoicesMock,
  synthesizeTts: synthesizeTtsMock,
  validateTtsG2p: validateTtsG2pMock,
}));

describe("tts routes", () => {
  it("returns provider voices", async () => {
    listTtsVoicesMock.mockResolvedValueOnce([
      { provider: "voisona", voiceName: "voice", displayName: "Voice" },
      { provider: "voicevox", voiceName: "3", voiceVersion: "1.0", displayName: "Zunda / Normal" },
    ]);

    const response = await ttsApp.request("/voices");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      options: [
        { provider: "voisona", voiceName: "voice", displayName: "Voice" },
        {
          provider: "voicevox",
          voiceName: "3",
          voiceVersion: "1.0",
          displayName: "Zunda / Normal",
        },
      ],
    });
  });

  it("generates G2P for one sentence", async () => {
    const g2p = createG2pItem("今日", "今日:キョ'ー");
    generateTtsG2pMock.mockResolvedValueOnce({ g2p, source: "llm" });
    const body = { pageId: "page-1", item: { id: "tts-1", text: "今日", provider: "voisona" } };

    const response = await ttsApp.request("/tts/g2p/generate", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ g2p, source: "llm" });
    expect(generateTtsG2pMock).toHaveBeenCalledWith(expect.anything(), body);
  });

  it("synthesizes through the selected provider", async () => {
    synthesizeTtsMock.mockResolvedValueOnce({
      audioSrc: "/tts/project/audio.wav",
      outputPath: "/tmp/audio.wav",
      durationSec: 1,
    });

    const response = await ttsApp.request("/tts/synthesize", {
      method: "POST",
      body: JSON.stringify({
        provider: "voisona",
        projectPath: "project",
        text: "hello",
        voiceName: "voice",
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      audioSrc: "/tts/project/audio.wav",
      outputPath: "/tmp/audio.wav",
      durationSec: 1,
    });
  });

  it("returns conflict when clearing cache during pending synthesis", async () => {
    const { TtsCacheClearConflictError } = await import("@/server/features/tts/errors");
    clearTtsCacheMock.mockRejectedValueOnce(new TtsCacheClearConflictError());

    const response = await ttsApp.request("/tts/cache", {
      method: "DELETE",
      body: JSON.stringify({ projectPath: "project" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "TTS synthesis is still pending",
    });
  });

  it("clears project tts cache", async () => {
    clearTtsCacheMock.mockResolvedValueOnce({ ok: true });

    const response = await ttsApp.request("/tts/cache", {
      method: "DELETE",
      body: JSON.stringify({ projectPath: "nested/example" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(clearTtsCacheMock).toHaveBeenCalledWith({ projectPath: "nested/example" });
  });

  it("keeps analysis_failed detail on generate", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    generateTtsG2pMock.mockRejectedValueOnce(
      new HaqumeiApiError({
        type: "about:blank",
        title: "Analysis failed",
        status: 500,
        code: "analysis_failed",
        detail: 'texts[0] "hello": mora mismatch: split=8 pitch_nuclei=7',
        errors: [{ path: "texts[0]", reason: "mora_mismatch", message: "" }],
      }),
    );

    const response = await ttsApp.request("/tts/g2p/generate", {
      method: "POST",
      body: JSON.stringify({
        pageId: "page-1",
        item: { id: "tts-1", text: "hello", provider: "voisona" },
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'texts[0] "hello": mora mismatch: split=8 pitch_nuclei=7',
      code: "analysis_failed",
      detail: 'texts[0] "hello": mora mismatch: split=8 pitch_nuclei=7',
      errors: [{ path: "texts[0]", reason: "mora_mismatch", message: "" }],
    });

    errorSpy.mockRestore();
  });
});
