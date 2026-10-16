import { z } from "zod";
import { g2pItemSchema } from "@/_schemas/g2p";
import {
  avatarSettingsSchema,
  coeiroinkSynthesisSettingsSchema,
  voicepeakSynthesisSettingsSchema,
  voicevoxSynthesisSettingsSchema,
  voisonaSynthesisSettingsSchema,
} from "@/_schemas/project/primitives";

const ttsFormSpeechSchema = z.object({
  g2p: g2pItemSchema.optional(),
});

const ttsFormBaseSchema = {
  id: z.string().min(1),
  text: z.string(),
  readText: z.string().optional(),
  padBeforeSec: z.number().default(0),
  padAfterSec: z.number().default(0),
  volume: z.number().min(0).max(1).default(1),
  speech: ttsFormSpeechSchema.optional(),
  avatar: avatarSettingsSchema.optional(),
};

const namedTtsFormIdentity = {
  voiceName: z.string().optional(),
  voiceVersion: z.string().optional(),
};

const coeiroinkTtsFormIdentity = {
  speakerUuid: z.string().min(1),
  styleId: z.number().int(),
  modelVersion: z.string().min(1),
};

export const ttsFormSchema = z.discriminatedUnion("provider", [
  z.object({
    ...ttsFormBaseSchema,
    ...namedTtsFormIdentity,
    provider: z.literal("voisona"),
    synthesisSettings: voisonaSynthesisSettingsSchema.nullish(),
  }),
  z.object({
    ...ttsFormBaseSchema,
    ...namedTtsFormIdentity,
    provider: z.literal("voicevox"),
    synthesisSettings: voicevoxSynthesisSettingsSchema.nullish(),
  }),
  z.object({
    ...ttsFormBaseSchema,
    ...namedTtsFormIdentity,
    provider: z.literal("voicepeak"),
    synthesisSettings: voicepeakSynthesisSettingsSchema.nullish(),
  }),
  z.object({
    ...ttsFormBaseSchema,
    ...coeiroinkTtsFormIdentity,
    provider: z.literal("coeiroink"),
    synthesisSettings: coeiroinkSynthesisSettingsSchema.nullish(),
  }),
]);

export type TtsFormValues = z.infer<typeof ttsFormSchema>;
