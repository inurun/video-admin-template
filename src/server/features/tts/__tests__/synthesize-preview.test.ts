import { beforeEach, describe, expect, it, vi } from "vitest";
import { createG2pItem } from "@/_schemas/__tests__/g2p-fixture";

const mocks = vi.hoisted(() => ({
  analyzeText: vi.fn(),
  generateG2pWithCache: vi.fn(),
  findSynthesisProsody: vi.fn(),
  planVoicevox: vi.fn(),
  planCoeiroink: vi.fn(),
}));

vi.mock("@/server/features/haqumei-api/analyze", () => ({ analyzeText: mocks.analyzeText }));
vi.mock("../llm-g2p", () => ({
  generateG2p: vi.fn(),
  generateG2pWithCache: mocks.generateG2pWithCache,
}));
vi.mock("../prosody/cache", () => ({ findSynthesisProsody: mocks.findSynthesisProsody }));
vi.mock("@/server/features/haqumei-api/synthesis", () => ({
  planVoicevoxSynthesis: mocks.planVoicevox,
  planCoeiroinkSynthesis: mocks.planCoeiroink,
}));

import { synthesizeTts } from "../use-case";

const prosody = { moras: [], pauses: [], pitch_weight: 1, timing_weight: 0.5 };
const result = { audioSrc: "/tts/project/a.wav", outputPath: "/tmp/a.wav", durationSec: 1 };

describe("synthesizeTts preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.planVoicevox.mockReturnValue({ run: async () => result });
    mocks.planCoeiroink.mockReturnValue({ run: async () => result });
  });

  it("uses the analyzer kana and cached prosody on a prosody engine", async () => {
    const g2p = createG2pItem("犬", "犬:イ'ヌ");
    mocks.analyzeText.mockResolvedValueOnce(g2p);
    mocks.findSynthesisProsody.mockResolvedValueOnce(prosody);

    await synthesizeTts(
      {},
      { provider: "voicevox", projectPath: "project", text: "犬", voiceName: "3" },
    );

    expect(mocks.generateG2pWithCache).not.toHaveBeenCalled();
    expect(mocks.findSynthesisProsody).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "voicevox" }),
      g2p,
    );
    expect(mocks.planVoicevox).toHaveBeenCalledWith(expect.objectContaining({ g2p, prosody }));
  });

  it("synthesizes without prosody when none is cached", async () => {
    const g2p = createG2pItem("犬", "犬:イ'ヌ");
    mocks.findSynthesisProsody.mockResolvedValueOnce(undefined);

    await synthesizeTts(
      {},
      { provider: "voicevox", projectPath: "project", text: "犬", voiceName: "3", g2p },
    );

    expect(mocks.analyzeText).not.toHaveBeenCalled();
    expect(mocks.planVoicevox.mock.calls[0]?.[0]).not.toHaveProperty("prosody");
  });

  it("keeps LLM G2P for an llm-g2p engine", async () => {
    const g2p = createG2pItem("猫", "猫:ネコ'");
    mocks.generateG2pWithCache.mockResolvedValueOnce(
      new Map([["preview", { g2p, source: "llm" }]]),
    );
    mocks.findSynthesisProsody.mockResolvedValueOnce(undefined);

    await synthesizeTts(
      {},
      {
        provider: "coeiroink",
        projectPath: "project",
        text: "猫",
        speakerUuid: "speaker",
        styleId: 1,
        modelVersion: "1",
      },
    );

    expect(mocks.analyzeText).not.toHaveBeenCalled();
    expect(mocks.planCoeiroink).toHaveBeenCalledWith(expect.objectContaining({ g2p }));
  });
});
