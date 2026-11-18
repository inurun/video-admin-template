import { afterEach, describe, expect, it, vi } from "vitest";
import { synthesizeProsodySource } from "../source";
import type { ProsodySource } from "../source-config";

const source: ProsodySource = {
  id: "test-source",
  model: "fish-audio/drama-3",
  voice: "hina",
  tag: "",
  sampleRate: 44_100,
};

describe("synthesizeProsodySource", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks Drama 3 for PCM with the voice's Fish id and wraps it in a 44.1 kHz mono WAV", async () => {
    const pcm = Buffer.from([1, 0, 2, 0]);
    const fetchMock = vi.fn(async () => new Response(pcm));
    vi.stubGlobal("fetch", fetchMock);

    const wav = await synthesizeProsodySource({ OPENROUTER_API_KEY: "secret" }, "犬が走る", source);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/audio/speech");
    expect(JSON.parse(String(init.body))).toEqual({
      model: "fish-audio/drama-3",
      input: "犬が走る",
      voice: "bf5634e34ee5489991fe687ad0d202c5",
      response_format: "pcm",
    });
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(44_100);
    expect(wav.readUInt32LE(40)).toBe(pcm.length);
    expect(wav.subarray(44)).toEqual(pcm);
  });

  it("puts the direction before the text", async () => {
    const fetchMock = vi.fn(async () => new Response(Buffer.from([1, 0])));
    vi.stubGlobal("fetch", fetchMock);

    await synthesizeProsodySource({ OPENROUTER_API_KEY: "secret" }, "犬が走る", {
      ...source,
      tag: "[annoyed, irritated]",
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.input).toBe("[annoyed, irritated] 犬が走る");
    expect(body).not.toHaveProperty("provider");
  });

  it("throws on an HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad", { status: 400 })),
    );
    await expect(
      synthesizeProsodySource({ OPENROUTER_API_KEY: "secret" }, "犬", source),
    ).rejects.toThrow("HTTP 400");
  });
});
