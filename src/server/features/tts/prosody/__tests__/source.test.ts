import { afterEach, describe, expect, it, vi } from "vitest";
import { synthesizeProsodySource } from "../source";

describe("synthesizeProsodySource", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks Gemini TTS for PCM and wraps it in a 24 kHz mono WAV", async () => {
    const pcm = Buffer.from([1, 0, 2, 0]);
    const fetchMock = vi.fn(async () => new Response(pcm));
    vi.stubGlobal("fetch", fetchMock);

    const wav = await synthesizeProsodySource({ OPENROUTER_API_KEY: "secret" }, "犬が走る");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/audio/speech");
    expect(JSON.parse(String(init.body))).toEqual({
      model: "google/gemini-3.8-flash-tts",
      input: "犬が走る",
      voice: "Zephyr",
      response_format: "pcm",
      instructions: "標準的な東京アクセントで、ふつうの会話のように自然に読む。間を空けずに読む。",
    });
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(24_000);
    expect(wav.readUInt32LE(40)).toBe(pcm.length);
    expect(wav.subarray(44)).toEqual(pcm);
  });

  it("throws on an HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad", { status: 400 })),
    );
    await expect(synthesizeProsodySource({ OPENROUTER_API_KEY: "secret" }, "犬")).rejects.toThrow(
      "HTTP 400",
    );
  });
});
