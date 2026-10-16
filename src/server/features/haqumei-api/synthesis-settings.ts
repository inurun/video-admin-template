import {
  type VoicevoxSynthesisSettings,
  type VoisonaSynthesisSettings,
  type CoeiroinkSynthesisSettings,
} from "@/_schemas";
import { toG2pItem } from "@/server/features/tts/g2p-item";
import type { components } from "@/server/generated/haqumei-api/schema";

export const VOICEVOX_SYNTHESIS_DEFAULTS = {
  outputStereo: true,
  prePhonemeLength: 0,
  postPhonemeLength: 0.1,
  pauseLengthScale: 0.5,
} as const;

const SYNTHESIS_SCHEMA_VERSION = "3";

function omitUndefinedSettings<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function omitNullExceptPauseLength(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter(([key, entry]) => entry !== null || key === "pauseLength"),
  );
}

export function buildVoicevoxSynthesisSettings(
  effective?: VoicevoxSynthesisSettings,
): components["schemas"]["VoicevoxSynthesisSettings"] {
  return omitNullExceptPauseLength(
    omitUndefinedSettings({
      ...VOICEVOX_SYNTHESIS_DEFAULTS,
      ...effective,
    }),
  ) as components["schemas"]["VoicevoxSynthesisSettings"];
}

export function buildVoicevoxSynthesisRequest(input: {
  item: components["schemas"]["G2pItem"];
  speaker: number;
  synthesisSettings?: VoicevoxSynthesisSettings;
}): components["schemas"]["VoicevoxSynthesisRequest"] {
  return {
    schema_version: SYNTHESIS_SCHEMA_VERSION,
    item: toG2pItem(input.item),
    speaker: input.speaker,
    synthesis_settings: buildVoicevoxSynthesisSettings(input.synthesisSettings),
  };
}

function isEmptyVoisonaSettings(settings?: VoisonaSynthesisSettings) {
  if (!settings) {
    return true;
  }

  return Object.values(settings).every((value) => value === undefined);
}

export function buildVoisonaSynthesisRequest(input: {
  item: components["schemas"]["G2pItem"];
  voiceName: string;
  voiceVersion?: string;
  synthesisSettings?: VoisonaSynthesisSettings;
}): components["schemas"]["VoisonaSynthesisRequest"] {
  const synthesisSettings = isEmptyVoisonaSettings(input.synthesisSettings)
    ? undefined
    : omitUndefinedSettings(input.synthesisSettings ?? {});

  return {
    schema_version: SYNTHESIS_SCHEMA_VERSION,
    item: toG2pItem(input.item),
    voice_name: input.voiceName,
    ...(input.voiceVersion ? { voice_version: input.voiceVersion } : {}),
    ...(synthesisSettings
      ? {
          synthesis_settings:
            synthesisSettings as components["schemas"]["VoisonaSynthesisSettings"],
        }
      : {}),
  };
}

function isEmptyCoeiroinkSettings(settings?: CoeiroinkSynthesisSettings) {
  if (!settings) {
    return true;
  }

  return Object.values(settings).every((value) => value === undefined);
}

export function buildCoeiroinkSynthesisRequest(input: {
  item: components["schemas"]["G2pItem"];
  speakerUuid: string;
  styleId: number;
  synthesisSettings?: CoeiroinkSynthesisSettings;
}): components["schemas"]["CoeiroinkSynthesisRequest"] {
  const synthesisSettings = isEmptyCoeiroinkSettings(input.synthesisSettings)
    ? undefined
    : omitUndefinedSettings(input.synthesisSettings ?? {});

  return {
    schema_version: SYNTHESIS_SCHEMA_VERSION,
    item: toG2pItem(input.item),
    speaker_uuid: input.speakerUuid,
    style_id: input.styleId,
    ...(synthesisSettings ? { synthesis_settings: synthesisSettings } : {}),
  };
}
