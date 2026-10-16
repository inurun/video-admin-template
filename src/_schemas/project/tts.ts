import { z } from "zod";
import { g2pItemSchema } from "@/_schemas/g2p";
import {
  avatarSettingsSchema,
  coeiroinkSynthesisSettingsSchema,
  voicepeakSynthesisSettingsSchema,
  voicevoxSynthesisSettingsSchema,
  voisonaSynthesisSettingsSchema,
} from "@/_schemas/project/primitives";

const ttsSpeechSchema = z.object({
  g2p: g2pItemSchema.optional(),
});

const ttsBaseSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  readText: z.string().optional(),
  padBeforeSec: z.number().default(0),
  padAfterSec: z.number().default(0),
  volume: z.number().min(0).max(1).default(1),
  speech: ttsSpeechSchema.optional(),
  avatar: avatarSettingsSchema.optional(),
});

const namedTtsIdentity = {
  voiceName: z.string().optional(),
  voiceVersion: z.string().optional(),
};

const coeiroinkTtsIdentity = {
  speakerUuid: z.string().min(1),
  styleId: z.number().int(),
  modelVersion: z.string().min(1),
};

export const savedTtsAudioSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("analyzing"),
      analysisKey: z.string().min(1),
    })
    .strict(),
  z
    .object({
      status: z.literal("pending"),
      src: z.string(),
    })
    .strict(),
  z
    .object({
      status: z.literal("ready"),
      src: z.string(),
      durationSec: z.number().nonnegative(),
    })
    .strict(),
  z
    .object({
      status: z.literal("failed"),
      src: z.string(),
      error: z.string().min(1),
    })
    .strict(),
]);

export type SavedTtsAudio = z.infer<typeof savedTtsAudioSchema>;

export const savedTtsSchema = z.discriminatedUnion("provider", [
  ttsBaseSchema.extend({
    provider: z.literal("voisona"),
    ...namedTtsIdentity,
    synthesisSettings: voisonaSynthesisSettingsSchema.nullish(),
    audio: savedTtsAudioSchema,
    speech: ttsSpeechSchema.default({}),
  }),
  ttsBaseSchema.extend({
    provider: z.literal("voicevox"),
    ...namedTtsIdentity,
    synthesisSettings: voicevoxSynthesisSettingsSchema.nullish(),
    audio: savedTtsAudioSchema,
    speech: ttsSpeechSchema.default({}),
  }),
  ttsBaseSchema.extend({
    provider: z.literal("voicepeak"),
    ...namedTtsIdentity,
    synthesisSettings: voicepeakSynthesisSettingsSchema.nullish(),
    audio: savedTtsAudioSchema,
    speech: ttsSpeechSchema.default({}),
  }),
  ttsBaseSchema.extend({
    provider: z.literal("coeiroink"),
    ...coeiroinkTtsIdentity,
    synthesisSettings: coeiroinkSynthesisSettingsSchema.nullish(),
    audio: savedTtsAudioSchema,
    speech: ttsSpeechSchema.default({}),
  }),
]);

export type SavedTts = z.infer<typeof savedTtsSchema>;
