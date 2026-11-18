import { describe, expect, it } from "vitest";
import { getSpeechPipeline, resolveSpeechPipelines, toSynthesisProsody } from "../speech-pipeline";

const providers = {
  voicevox: { pipelines: { "llm-g2p": true, prosody: { pitch: true } } },
  voisona: { pipelines: { "llm-g2p": true, prosody: {} } },
  coeiroink: { pipelines: { "llm-g2p": true } },
  voicepeak: { pipelines: {} },
} as const;

const extract = {
  schema_version: "3",
  aligner_version: "mms-fa-1",
  score: 0.7,
  moras: [{ start: 0, vowel_start: 0.05, end: 0.1, log_f0: 5.4 }],
  pauses: [],
};

describe("resolveSpeechPipelines", () => {
  it("combines the template choice with the default weights", () => {
    expect(
      resolveSpeechPipelines(
        {
          voicevox: { pipeline: "prosody" },
          voisona: { pipeline: "prosody", timingWeight: 0.3 },
          coeiroink: { pipeline: "llm-g2p" },
        },
        providers,
      ),
    ).toEqual({
      voicevox: {
        pipeline: "prosody",
        pitchWeight: 0.8,
        timingWeight: 0.8,
        pitchSmoothing: 0,
        pitchRangeWeight: 1,
      },
      voisona: {
        pipeline: "prosody",
        pitchWeight: 0,
        timingWeight: 0.3,
        pitchSmoothing: 0,
        pitchRangeWeight: 0,
      },
      coeiroink: { pipeline: "llm-g2p" },
      voicepeak: { pipeline: "none" },
    });
  });

  it("uses llm-g2p for an engine the template leaves out when it can", () => {
    expect(resolveSpeechPipelines({}, providers)).toMatchObject({
      voicevox: { pipeline: "llm-g2p" },
      voicepeak: { pipeline: "none" },
    });
  });

  it("rejects a pipeline the engine cannot take", () => {
    expect(() => resolveSpeechPipelines({ coeiroink: { pipeline: "prosody" } }, providers)).toThrow(
      "coeiroink does not take prosody",
    );
    expect(() => resolveSpeechPipelines({ voicepeak: { pipeline: "llm-g2p" } }, providers)).toThrow(
      "voicepeak does not take llm-g2p",
    );
  });

  it("takes the template's pitch weight over the default", () => {
    expect(
      resolveSpeechPipelines({ voicevox: { pipeline: "prosody", pitchWeight: 0.6 } }, providers),
    ).toMatchObject({ voicevox: { pipeline: "prosody", pitchWeight: 0.6, timingWeight: 0.8 } });
  });

  it("rejects a pitch weight on an engine that takes no pitch", () => {
    expect(() =>
      resolveSpeechPipelines({ voisona: { pipeline: "prosody", pitchWeight: 0.5 } }, providers),
    ).toThrow("voisona does not take pitch");
    expect(() =>
      resolveSpeechPipelines({ voisona: { pipeline: "prosody", pitchSmoothing: 0.5 } }, providers),
    ).toThrow("voisona does not take pitch");
  });

  it("takes the template's pitch smoothing", () => {
    expect(
      resolveSpeechPipelines({ voicevox: { pipeline: "prosody", pitchSmoothing: 0.5 } }, providers),
    ).toMatchObject({ voicevox: { pitchSmoothing: 0.5 } });
    expect(() =>
      resolveSpeechPipelines({ voicevox: { pipeline: "prosody", pitchSmoothing: 2 } }, providers),
    ).toThrow("pitchSmoothing");
    expect(() =>
      resolveSpeechPipelines({ voisona: { pipeline: "prosody", pitchRangeWeight: 1 } }, providers),
    ).toThrow("does not take pitch");
    expect(() =>
      resolveSpeechPipelines(
        { voicevox: { pipeline: "prosody", pitchRangeWeight: 1.5 } },
        providers,
      ),
    ).toThrow("pitchRangeWeight");
  });

  it("takes the template's pitch limit on pitch engines only", () => {
    expect(
      resolveSpeechPipelines({ voicevox: { pipeline: "prosody", pitchLimit: 2 } }, providers),
    ).toMatchObject({ voicevox: { pitchLimit: 2 } });
    expect(() =>
      resolveSpeechPipelines({ voicevox: { pipeline: "prosody", pitchLimit: 0 } }, providers),
    ).toThrow("pitchLimit");
    expect(() =>
      resolveSpeechPipelines({ voisona: { pipeline: "prosody", pitchLimit: 2 } }, providers),
    ).toThrow("voisona does not take pitch");
  });

  it("rejects a weight outside 0 to 1", () => {
    expect(() =>
      resolveSpeechPipelines({ voicevox: { pipeline: "prosody", timingWeight: 1.5 } }, providers),
    ).toThrow("timingWeight");
    expect(() =>
      resolveSpeechPipelines({ voicevox: { pipeline: "prosody", pitchWeight: -0.1 } }, providers),
    ).toThrow("pitchWeight");
  });
});

describe("template speech config", () => {
  it("runs prosody on VOICEVOX and VoiSona and LLM G2P on COEIROINK", () => {
    expect(getSpeechPipeline("voicevox")).toEqual({
      pipeline: "prosody",
      pitchWeight: 0.8,
      timingWeight: 0.8,
      pitchSmoothing: 0,
      pitchRangeWeight: 1,
    });
    expect(getSpeechPipeline("voisona")).toEqual({
      pipeline: "prosody",
      pitchWeight: 0,
      timingWeight: 0.8,
      pitchSmoothing: 0,
      pitchRangeWeight: 0,
    });
    expect(getSpeechPipeline("coeiroink")).toEqual({ pipeline: "llm-g2p" });
    expect(getSpeechPipeline("voicepeak")).toEqual({ pipeline: "none" });
  });

  it("adds the weights to the extract only for prosody engines", () => {
    expect(toSynthesisProsody("voicevox", extract)).toEqual({
      moras: extract.moras,
      pauses: [],
      pitch_weight: 0.8,
      timing_weight: 0.8,
      pitch_range_weight: 1,
    });
    expect(toSynthesisProsody("coeiroink", extract)).toBeUndefined();
    expect(toSynthesisProsody("voicevox", undefined)).toBeUndefined();
  });
});
