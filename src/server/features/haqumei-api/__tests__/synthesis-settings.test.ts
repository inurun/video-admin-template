import { describe, expect, it } from "vitest";
import { createG2pItem } from "@/_schemas/__tests__/g2p-fixture";
import {
  buildVoicevoxSynthesisRequest,
  buildVoisonaSynthesisRequest,
  buildCoeiroinkSynthesisRequest,
} from "../synthesis-settings";

const item = createG2pItem("hello");

describe("synthesis request builders", () => {
  it("merges VOICEVOX defaults and keeps pauseLength null", () => {
    const request = buildVoicevoxSynthesisRequest({
      item,
      speaker: 3,
      synthesisSettings: {
        speedScale: 1.4,
        pauseLength: null,
      },
    });

    expect(request).toEqual({
      schema_version: "3",
      item,
      speaker: 3,
      synthesis_settings: {
        outputStereo: true,
        prePhonemeLength: 0,
        postPhonemeLength: 0.1,
        pauseLengthScale: 0.5,
        speedScale: 1.4,
        pauseLength: null,
      },
    });
    expect(JSON.stringify(request)).toContain('"pauseLength":null');
  });

  it("omits VoiSona voice_version and empty settings", () => {
    expect(
      buildVoisonaSynthesisRequest({
        item,
        voiceName: "futaba-minato_ja_JP",
      }),
    ).toEqual({
      schema_version: "3",
      item,
      voice_name: "futaba-minato_ja_JP",
    });
  });

  it("forwards VoiSona voice_version and settings without nulls", () => {
    const request = buildVoisonaSynthesisRequest({
      item,
      voiceName: "futaba-minato_ja_JP",
      voiceVersion: "2.0.2",
      synthesisSettings: {
        speed: 1.4,
        huskiness: 0.7,
        style_weights: [0, 1],
      },
    });

    expect(request).toEqual({
      schema_version: "3",
      item,
      voice_name: "futaba-minato_ja_JP",
      voice_version: "2.0.2",
      synthesis_settings: {
        speed: 1.4,
        huskiness: 0.7,
        style_weights: [0, 1],
      },
    });
    expect(JSON.stringify(request)).not.toContain("null");
  });

  it("omits dictionary_words from synthesis items", () => {
    const item = {
      ...createG2pItem("雨衣", "アメコロ'"),
      dictionary_words: [{ word_index: 0, kind: "fixed" }],
    };
    expect(buildVoicevoxSynthesisRequest({ item, speaker: 3 }).item).toEqual({
      text: "雨衣",
      kana: "アメコロ'",
      warnings: [],
    });
    expect(buildVoisonaSynthesisRequest({ item, voiceName: "voice" }).item).toEqual({
      text: "雨衣",
      kana: "アメコロ'",
      warnings: [],
    });
  });

  it("sends only g2p fields, uuid, numeric style, and provided coeiroink settings", () => {
    const request = buildCoeiroinkSynthesisRequest({
      item,
      speakerUuid: "speaker-1",
      styleId: 0,
      synthesisSettings: {
        speedScale: 1.2,
        outputSamplingRate: 44100,
      },
    });

    expect(request).toEqual({
      schema_version: "3",
      item,
      speaker_uuid: "speaker-1",
      style_id: 0,
      synthesis_settings: {
        speedScale: 1.2,
        outputSamplingRate: 44100,
      },
    });
    expect(JSON.stringify(request)).not.toContain("modelVersion");
    expect(JSON.stringify(request)).not.toContain("dictionary_words");
  });

  it("omits empty coeiroink settings", () => {
    expect(
      buildCoeiroinkSynthesisRequest({
        item,
        speakerUuid: "speaker-1",
        styleId: 1,
      }),
    ).toEqual({
      schema_version: "3",
      item,
      speaker_uuid: "speaker-1",
      style_id: 1,
    });
  });
});
