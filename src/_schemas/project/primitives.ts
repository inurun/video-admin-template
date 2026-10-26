import { z } from "zod";
import { WEATHER_LOCATION_IDS } from "@/_schemas/catalog/weather";
import { AVATAR_TYPES, type AvatarAppearance } from "@/_schemas/catalog/avatar";

export { avatarOptions, type AvatarType } from "@/_schemas/catalog/avatar";
export { WEATHER_LOCATION_IDS, WEATHER_LOCATION_LABELS } from "@/_schemas/catalog/weather";
export {
  DEFAULT_KASANE_TETO_EMOTION,
  DEFAULT_VOICEPEAK_PITCH,
  DEFAULT_VOICEPEAK_SPEED,
  DEFAULT_VOICE_PRESETS,
  KASANE_TETO_NARRATOR,
} from "@/_schemas/catalog/voices";

export {
  copyVoiceIdentity,
  getVoiceId,
  getVoiceMatchKey,
  hasVoiceIdentity,
  parseVoiceId,
  toVoiceIdentity,
  ttsVoiceId,
  voiceIdentitiesEqual,
  voicePresetId,
  type CoeiroinkVoiceIdentity,
  type NamedVoiceIdentity,
  type NamedVoiceProvider,
  type VoiceIdentity,
} from "@/_schemas/project/voice-identity";

export const voiceProviderSchema = z.enum(["voisona", "voicevox", "voicepeak", "coeiroink"]);

export const voisonaSynthesisSettingsSchema = z.object({
  alp: z.number().optional(),
  huskiness: z.number().optional(),
  intonation: z.number().optional(),
  pitch: z.number().optional(),
  speed: z.number().optional(),
  volume: z.number().optional(),
  style_weights: z.array(z.number()).optional(),
});

export const voicevoxSynthesisSettingsSchema = z.object({
  speedScale: z.number().optional(),
  pitchScale: z.number().optional(),
  intonationScale: z.number().optional(),
  volumeScale: z.number().optional(),
  pauseLength: z.number().nullable().optional(),
  prePhonemeLength: z.number().optional(),
  postPhonemeLength: z.number().optional(),
  pauseLengthScale: z.number().optional(),
});

export const voicepeakSynthesisSettingsSchema = z.object({
  speed: z.number().min(50).max(200).optional(),
  pitch: z.number().min(-300).max(300).optional(),
  emotion: z.record(z.string(), z.number()).optional(),
});

export const coeiroinkSynthesisSettingsSchema = z.object({
  speedScale: z.number().gt(0).optional(),
  volumeScale: z.number().min(0).optional(),
  intonationScale: z.number().min(0).optional(),
  pitchScale: z.number().finite().optional(),
  prePhonemeLength: z.number().min(0).optional(),
  postPhonemeLength: z.number().min(0).optional(),
  pauseLength: z.number().min(0).optional(),
  outputSamplingRate: z.number().int().positive().optional(),
});

/** Only the fields that differ from the layer below (page default → catalog default). */
export const avatarOverrideSchema = z.object({
  base: z.string().min(1).optional(),
  eyes: z.string().min(1).optional(),
  mouth: z.string().min(1).optional(),
});

/**
 * Who owns a line's eyes / mouth. Auto states carry the key of the turn text they were made for;
 * a stale key means auto runs again on the next save. Manual lines are never touched by auto.
 */
export const avatarSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("auto"), key: z.string().min(1) }),
  z.object({ kind: z.literal("pending"), key: z.string().min(1) }),
  z.object({ kind: z.literal("failed"), key: z.string().min(1) }),
  z.object({ kind: z.literal("manual") }),
]);

export const avatarTypeSchema = z.enum(AVATAR_TYPES);

const namedVoiceOptionFields = {
  voiceName: z.string().min(1),
  voiceVersion: z.string().optional(),
  displayName: z.string().min(1),
};

export const voiceOptionSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("voisona"),
    ...namedVoiceOptionFields,
  }),
  z.object({
    provider: z.literal("voicevox"),
    ...namedVoiceOptionFields,
  }),
  z.object({
    provider: z.literal("voicepeak"),
    ...namedVoiceOptionFields,
  }),
  z.object({
    provider: z.literal("coeiroink"),
    speakerUuid: z.string().min(1),
    styleId: z.number().int(),
    modelVersion: z.string().min(1),
    displayName: z.string().min(1),
    speakerName: z.string().min(1),
    styleName: z.string().min(1),
  }),
]);

const namedVoicePresetFields = {
  voiceName: z.string().min(1),
  voiceVersion: z.string().optional(),
};

export const voicePresetSchema = z.discriminatedUnion("provider", [
  z.object({
    ...namedVoicePresetFields,
    provider: z.literal("voisona"),
    synthesisSettings: voisonaSynthesisSettingsSchema,
  }),
  z.object({
    ...namedVoicePresetFields,
    provider: z.literal("voicevox"),
    synthesisSettings: voicevoxSynthesisSettingsSchema,
  }),
  z.object({
    ...namedVoicePresetFields,
    provider: z.literal("voicepeak"),
    synthesisSettings: voicepeakSynthesisSettingsSchema,
  }),
  z.object({
    provider: z.literal("coeiroink"),
    speakerUuid: z.string().min(1),
    styleId: z.number().int(),
    modelVersion: z.string().min(1),
    synthesisSettings: coeiroinkSynthesisSettingsSchema,
  }),
]);

export const pageTypeSchema = z.enum([
  "intro",
  "eyecatch-text",
  "main",
  "comments",
  "outro",
  "endcard",
]);
export const transitionVariantSchema = z.enum(["slide"]);

const weatherLocationSchema = z.enum(WEATHER_LOCATION_IDS);

export const weatherConditionSchema = z.enum(["clear", "cloudy", "rain", "storm", "snow"]);

export const weatherForecastSchema = z.object({
  temperatureC: z.number(),
  precipitationProbability: z.number().int().min(0).max(100),
  condition: weatherConditionSchema,
});

export const weatherForecastsSchema = z
  .partialRecord(weatherLocationSchema, weatherForecastSchema)
  .default({});

const ogpTextSchema = z.string().default("");
const ogpUrlSchema = z.string().nullable().default(null);

export const ogpMetadataSchema = z.object({
  url: z.string().url(),
  title: ogpTextSchema,
  description: ogpTextSchema,
  image: ogpUrlSchema,
  logo: ogpUrlSchema,
  favicon: ogpUrlSchema,
  author: ogpTextSchema,
  date: ogpTextSchema,
  publisher: ogpTextSchema,
  lang: ogpTextSchema,
  audio: ogpUrlSchema,
  video: ogpUrlSchema,
  iframe: ogpTextSchema,
  feed: ogpTextSchema,
});

export const ogpMetadataKeys = [
  "url",
  "title",
  "description",
  "image",
  "logo",
  "favicon",
  "author",
  "date",
  "publisher",
  "lang",
  "audio",
  "video",
  "iframe",
  "feed",
] as const satisfies ReadonlyArray<keyof z.infer<typeof ogpMetadataSchema>>;

export const outroBlockSchema = ogpMetadataSchema.extend({
  id: z.string().min(1),
  impression: ogpTextSchema,
});

export const pageTagsMetaSchema = z
  .object({
    tags: z.array(z.string().trim().min(1)).default([]),
  })
  .default({ tags: [] });

export const mainPageMetaSchema = z
  .object({
    tags: z.array(z.string().trim().min(1)).default([]),
    avatars: z.partialRecord(avatarTypeSchema, avatarOverrideSchema).optional(),
  })
  .default({ tags: [] });

export const outroPageMetaSchema = z
  .object({
    tags: z.array(z.string().trim().min(1)).default([]),
    blocks: z.array(outroBlockSchema).default([]),
  })
  .default({ tags: [], blocks: [] });

export const endcardCreditSchema = z.object({
  id: z.string().min(1),
  title: z.string().default(""),
  url: z.string().default(""),
});

export const endcardAdvertiserSchema = z.object({
  id: z.string().min(1),
  userId: z.number().int().optional(),
  identityKey: z.string().min(1),
  introductionCount: z.number().int().nonnegative().default(0),
  name: z.string().default(""),
  message: z.string().default(""),
});

export const endcardMessageSchema = z.object({
  id: z.string().min(1),
  text: z.string().default(""),
});

export const endcardPageMetaSchema = z
  .object({
    tags: z.array(z.string().trim().min(1)).default([]),
    nicoadSource: z.string().default(""),
    credits: z.array(endcardCreditSchema).default([]),
    advertisers: z.array(endcardAdvertiserSchema).default([]),
    messages: z.array(endcardMessageSchema).default([]),
  })
  .default({
    tags: [],
    nicoadSource: "",
    credits: [],
    advertisers: [],
    messages: [],
  });

export const bgmTrackSchema = z.object({
  src: z.string(),
  startSec: z.number().nullable().default(null),
  endSec: z.number().nullable().default(null),
  fadeIn: z.boolean().default(false),
  fadeOut: z.boolean().default(false),
  volume: z.number().min(0).max(1).default(1),
});

export const projectNiconicoMetaSchema = z
  .object({
    title: z.string().default(""),
    description: z.string().default(""),
    thumbnailTime: z.string().default("00:00.000"),
    parentWorkIds: z.array(z.string()).default([]),
    tags: z.array(z.string().trim().min(1)).max(6).default([]),
  })
  .default({
    title: "",
    description: "",
    thumbnailTime: "00:00.000",
    parentWorkIds: [],
    tags: [],
  });

const projectMetaFieldsSchema = z.object({
  title: z.string().default("project"),
  description: z.string().default(""),
  width: z.number().int().positive().default(1920),
  height: z.number().int().positive().default(1080),
  updatedAt: z.iso.datetime({ offset: true }).optional(),
  weather: weatherForecastsSchema,
  niconico: projectNiconicoMetaSchema,
});

export const DEFAULT_PROJECT_META = {
  title: "project",
  description: "",
  width: 1920,
  height: 1080,
  weather: {},
  niconico: {
    title: "",
    description: "",
    thumbnailTime: "00:00.000",
    parentWorkIds: [] as string[],
    tags: [] as string[],
  },
};

export const projectMetaSchema = projectMetaFieldsSchema.default(DEFAULT_PROJECT_META);

export type BgmTrack = z.infer<typeof bgmTrackSchema>;
export type VoisonaSynthesisSettings = z.infer<typeof voisonaSynthesisSettingsSchema>;
export type VoicevoxSynthesisSettings = z.infer<typeof voicevoxSynthesisSettingsSchema>;
export type VoicepeakSynthesisSettings = z.infer<typeof voicepeakSynthesisSettingsSchema>;
export type CoeiroinkSynthesisSettings = z.infer<typeof coeiroinkSynthesisSettingsSchema>;
export type AvatarSettings = AvatarAppearance;
export type AvatarOverride = z.infer<typeof avatarOverrideSchema>;
export type AvatarSource = z.infer<typeof avatarSourceSchema>;
export type MainPageMeta = z.infer<typeof mainPageMetaSchema>;
export type VoiceOption = z.infer<typeof voiceOptionSchema>;
export type VoicePreset = z.infer<typeof voicePresetSchema>;
export type PageType = z.infer<typeof pageTypeSchema>;
export type TransitionVariant = z.infer<typeof transitionVariantSchema>;
export type OgpMetadata = z.infer<typeof ogpMetadataSchema>;
export type OutroBlock = z.infer<typeof outroBlockSchema>;
export type EndcardCredit = z.infer<typeof endcardCreditSchema>;
export type EndcardAdvertiser = z.infer<typeof endcardAdvertiserSchema>;
export type EndcardMessage = z.infer<typeof endcardMessageSchema>;
export type WeatherLocation = z.infer<typeof weatherLocationSchema>;
export type WeatherCondition = z.infer<typeof weatherConditionSchema>;
export type WeatherForecast = z.infer<typeof weatherForecastSchema>;
export type WeatherForecasts = z.infer<typeof weatherForecastsSchema>;
