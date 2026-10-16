import { z } from "zod";
import {
  g2pItemSchema,
  voiceOptionSchema,
  coeiroinkSynthesisSettingsSchema,
  voicepeakSynthesisSettingsSchema,
  voicevoxSynthesisSettingsSchema,
  voisonaSynthesisSettingsSchema,
} from "@/_schemas";

export const voicesResponseSchema = z.object({
  options: z.array(voiceOptionSchema),
});

export const ttsValidateRequestSchema = z.object({
  text: z.string().min(1),
  kana: z.string().min(1),
});

export const ttsValidateResponseSchema = z.object({
  g2p: g2pItemSchema,
});

const ttsG2pNeighborSchema = z.object({
  text: z.string(),
  readText: z.string().optional(),
});

export const ttsG2pGenerateRequestSchema = z.object({
  pageId: z.string().min(1),
  item: z.object({
    id: z.string().min(1),
    text: z.string().min(1),
    readText: z.string().optional(),
    previous: ttsG2pNeighborSchema.optional(),
    next: ttsG2pNeighborSchema.optional(),
  }),
});

export const ttsG2pGenerateResponseSchema = z.object({
  g2p: g2pItemSchema,
  source: z.enum(["llm", "analyze"]),
});

export type TtsG2pGenerateRequest = z.infer<typeof ttsG2pGenerateRequestSchema>;
export type TtsG2pGenerateResponse = z.infer<typeof ttsG2pGenerateResponseSchema>;

export const ttsSynthesizeRequestSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("voisona"),
    projectPath: z.string().min(1),
    text: z.string().min(1),
    g2p: g2pItemSchema.optional(),
    voiceName: z.string().min(1),
    voiceVersion: z.string().optional(),
    synthesisSettings: voisonaSynthesisSettingsSchema.nullish(),
  }),
  z.object({
    provider: z.literal("voicevox"),
    projectPath: z.string().min(1),
    text: z.string().min(1),
    g2p: g2pItemSchema.optional(),
    voiceName: z.string().min(1),
    voiceVersion: z.string().optional(),
    synthesisSettings: voicevoxSynthesisSettingsSchema.nullish(),
  }),
  z.object({
    provider: z.literal("voicepeak"),
    projectPath: z.string().min(1),
    text: z.string().min(1),
    g2p: g2pItemSchema.optional(),
    voiceName: z.string().min(1),
    voiceVersion: z.string().optional(),
    synthesisSettings: voicepeakSynthesisSettingsSchema.nullish(),
  }),
  z.object({
    provider: z.literal("coeiroink"),
    projectPath: z.string().min(1),
    text: z.string().min(1),
    g2p: g2pItemSchema.optional(),
    speakerUuid: z.string().min(1),
    styleId: z.number().int(),
    modelVersion: z.string().min(1),
    synthesisSettings: coeiroinkSynthesisSettingsSchema.nullish(),
  }),
]);

export const ttsClearCacheRequestSchema = z.object({
  projectPath: z.string().min(1),
});

export const ttsClearCacheResponseSchema = z.object({
  ok: z.literal(true),
});

export const synthesizeResponseSchema = z.object({
  audioSrc: z.string().min(1),
  outputPath: z.string().min(1),
  durationSec: z.number().nonnegative(),
});

export type SynthesizeResponse = z.infer<typeof synthesizeResponseSchema>;
