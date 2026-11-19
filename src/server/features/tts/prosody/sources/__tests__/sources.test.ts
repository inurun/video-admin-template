import { afterEach, describe, expect, it, vi } from "vitest";
import { drama3Source } from "../drama3";
import { elevenV4TurboSource } from "../eleven";

const env = { OPENROUTER_API_KEY: "secret" };

function stubFetch(pcm = Buffer.from([1, 0, 2, 0])) {
  const fetchMock = vi.fn(async () => new Response(pcm));
  vi.stubGlobal("fetch", fetchMock);
  return {
    body: () => {
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://openrouter.ai/api/v1/audio/speech");
      return JSON.parse(String(init.body));
    },
  };
}

describe("prosody sources", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks Eleven v4 Turbo with the voice settings, seed and context, as a 24 kHz WAV", async () => {
    const pcm = Buffer.from([1, 0, 2, 0]);
    const fetched = stubFetch(pcm);

    const wav = await elevenV4TurboSource.synthesize(env, {
      text: "犬が走る",
      voice: "voice-id",
      tag: "[in a monotone]",
      context: { previous: "前の文。", next: "次の文。" },
    });

    expect(fetched.body()).toEqual({
      model: "elevenlabs/eleven-v4-turbo",
      input: "[in a monotone] 犬が走る",
      voice: "voice-id",
      response_format: "pcm",
      provider: {
        options: {
          elevenlabs: {
            voice_settings: { stability: 1, style: 1 },
            seed: 7,
            previous_text: "前の文。",
            next_text: "次の文。",
          },
        },
      },
    });
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(24_000);
    expect(wav.readUInt32LE(40)).toBe(pcm.length);
    expect(wav.subarray(44)).toEqual(pcm);
  });

  it("leaves out empty context on Eleven", async () => {
    const fetched = stubFetch();
    await elevenV4TurboSource.synthesize(env, { text: "犬", voice: "v", tag: "" });
    expect(fetched.body().provider.options.elevenlabs).toEqual({
      voice_settings: { stability: 1, style: 1 },
      seed: 7,
    });
    expect(fetched.body().input).toBe("犬");
  });

  it("asks Drama 3 with the voice id only, as a 44.1 kHz WAV", async () => {
    const fetched = stubFetch();
    const wav = await drama3Source.synthesize(env, { text: "犬", voice: "fish-id", tag: "" });
    expect(fetched.body()).toEqual({
      model: "fish-audio/drama-3",
      input: "犬",
      voice: "fish-id",
      response_format: "pcm",
    });
    expect(wav.readUInt32LE(24)).toBe(44_100);
  });

  it("spells readings in katakana for Eleven and as phonemes for Drama 3", () => {
    const kana = "早急:ソーキュー'|に:ニ/相殺:ソーサイ'|した:シタ";
    const readings = new Map([[0, "サッキュー"]]);
    expect(elevenV4TurboSource.spell("早急に相殺した", kana, readings)).toBe(
      "サッキューに相殺した",
    );
    expect(drama3Source.spell("早急に相殺した", kana, readings)).toContain("<|phoneme_start|>");
  });

  it("throws on an HTTP error or without an API key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad", { status: 400 })),
    );
    await expect(
      elevenV4TurboSource.synthesize(env, { text: "犬", voice: "v", tag: "" }),
    ).rejects.toThrow("HTTP 400");
    await expect(drama3Source.synthesize({}, { text: "犬", voice: "v", tag: "" })).rejects.toThrow(
      "OPENROUTER_API_KEY",
    );
  });
});
