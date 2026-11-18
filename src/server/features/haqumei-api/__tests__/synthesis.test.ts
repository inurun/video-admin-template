import { beforeEach, describe, expect, it, vi } from "vitest";
import { createG2pItem } from "@/_schemas/__tests__/g2p-fixture";

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({ default: { writeFile: mocks.writeFile } }));
vi.mock("../client", () => ({
  getHaqumeiApiClient: () => ({ POST: mocks.post }),
  unwrapHaqumeiData: (result: { data: unknown }) => result.data,
}));
vi.mock("@/server/features/tts/wav-cache", async () => ({
  ...(await vi.importActual<typeof import("@/server/features/tts/wav-cache")>(
    "@/server/features/tts/wav-cache",
  )),
  synthesizeWithWavCache: async (input: {
    wav: { outputPath: string; audioSrc: string };
    writeWav: (outputPath: string) => Promise<void>;
  }) => {
    await input.writeWav(input.wav.outputPath);
    return { outputPath: input.wav.outputPath, audioSrc: input.wav.audioSrc, durationSec: 1 };
  },
}));

import { planVoicevoxSynthesis, planVoisonaSynthesis } from "../synthesis";

const g2p = createG2pItem("hello", "ハロー'");
const prosody = {
  moras: [
    { start: 0, vowel_start: 0.05, end: 0.1, log_f0: 5.4 },
    { start: 0.1, vowel_start: 0.15, end: 0.2, log_f0: null },
    { start: 0.2, vowel_start: 0.2, end: 0.3, log_f0: 5.2 },
  ],
  pauses: [],
  pitch_weight: 1,
  pitch_range_weight: 1,
  timing_weight: 0.5,
};
const base = { serverEnv: {}, projectPath: "project", g2p, voiceName: "3" };

describe("prosody in haqumei synthesis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.post.mockResolvedValue({ data: new Blob(["RIFF"]) });
  });

  it("sends prosody to VOICEVOX and keys the WAV by it", async () => {
    const plain = planVoicevoxSynthesis(base);
    const withProsody = planVoicevoxSynthesis({ ...base, prosody });
    const moreTiming = planVoicevoxSynthesis({
      ...base,
      prosody: { ...prosody, timing_weight: 1 },
    });

    expect(withProsody.wav.fileName).not.toBe(plain.wav.fileName);
    expect(moreTiming.wav.fileName).not.toBe(withProsody.wav.fileName);
    expect(planVoicevoxSynthesis({ ...base, prosody }).wav.fileName).toBe(withProsody.wav.fileName);

    await withProsody.run();
    expect(mocks.post).toHaveBeenCalledWith("/v1/synthesis/voicevox", {
      body: expect.objectContaining({ speaker: 3, item: g2p, prosody }),
      parseAs: "blob",
    });

    await plain.run();
    expect(mocks.post.mock.calls[1]?.[1].body).not.toHaveProperty("prosody");
  });

  it("sends prosody to VoiSona and keys the WAV by it", async () => {
    const voisona = { ...base, voiceName: "voice" };
    const plain = planVoisonaSynthesis(voisona);
    const withProsody = planVoisonaSynthesis({
      ...voisona,
      prosody: { ...prosody, pitch_weight: 0 },
    });

    expect(withProsody.wav.fileName).not.toBe(plain.wav.fileName);
    await withProsody.run();
    expect(mocks.post).toHaveBeenCalledWith("/v1/synthesis/voisona", {
      body: expect.objectContaining({
        voice_name: "voice",
        prosody: { ...prosody, pitch_weight: 0 },
      }),
      parseAs: "blob",
    });
  });
});
