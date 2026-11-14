import { afterEach, describe, expect, it, vi } from "vitest";
import { synthesizeProsodySource } from "../source";
import { prosodySourceFor } from "../source-config";

const source = prosodySourceFor({ provider: "voicevox", voiceName: "3" });

describe("synthesizeProsodySource", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks ElevenLabs v4 for PCM and wraps it in a 24 kHz mono WAV", async () => {
    const pcm = Buffer.from([1, 0, 2, 0]);
    const fetchMock = vi.fn(async () => new Response(pcm));
    vi.stubGlobal("fetch", fetchMock);

    const wav = await synthesizeProsodySource({ OPENROUTER_API_KEY: "secret" }, "犬が走る", source);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/audio/speech");
    expect(JSON.parse(String(init.body))).toEqual({
      model: "elevenlabs/eleven-v4",
      input: "犬が走る",
      voice: "sarah",
      response_format: "pcm",
    });
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(24_000);
    expect(wav.readUInt32LE(40)).toBe(pcm.length);
    expect(wav.subarray(44)).toEqual(pcm);
  });

  it("sends the neighboring utterances as ElevenLabs context", async () => {
    const fetchMock = vi.fn(async () => new Response(Buffer.from([1, 0])));
    vi.stubGlobal("fetch", fetchMock);
    const bodyOf = (call: number) =>
      JSON.parse(String((fetchMock.mock.calls[call] as unknown as [string, RequestInit])[1].body));

    await synthesizeProsodySource({ OPENROUTER_API_KEY: "secret" }, "犬が走る", source, {
      previous: "前の文。",
      next: "次の文。",
    });
    await synthesizeProsodySource({ OPENROUTER_API_KEY: "secret" }, "犬が走る", source, {
      previous: "前の文。",
    });
    await synthesizeProsodySource({ OPENROUTER_API_KEY: "secret" }, "犬が走る", source, {});

    expect(bodyOf(0).provider).toEqual({
      options: { elevenlabs: { previous_text: "前の文。", next_text: "次の文。" } },
    });
    expect(bodyOf(1).provider).toEqual({
      options: { elevenlabs: { previous_text: "前の文。" } },
    });
    expect(bodyOf(2)).not.toHaveProperty("provider");
    expect(bodyOf(0)).not.toHaveProperty("instructions");
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
