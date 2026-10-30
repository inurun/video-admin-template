import { z } from "zod";
import {
  coeiroinkSynthesisSettingsSchema,
  voicevoxSynthesisSettingsSchema,
  voisonaSynthesisSettingsSchema,
} from "@/_schemas/project/primitives";

const g2pReviewVoiceSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("voisona"),
    voiceName: z.string().min(1),
    voiceVersion: z.string().optional(),
    synthesisSettings: voisonaSynthesisSettingsSchema.optional(),
  }),
  z.object({
    provider: z.literal("voicevox"),
    voiceName: z.string().min(1),
    voiceVersion: z.string().optional(),
    synthesisSettings: voicevoxSynthesisSettingsSchema.optional(),
  }),
  z.object({
    provider: z.literal("coeiroink"),
    speakerUuid: z.string().min(1),
    styleId: z.number().int(),
    modelVersion: z.string().min(1),
    synthesisSettings: coeiroinkSynthesisSettingsSchema.optional(),
  }),
]);

/** 聞いて確かめた kana だけが正解。reviewed が false の kana は評価に使わない。 */
export const g2pReviewItemSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  previous: z.string().optional(),
  next: z.string().optional(),
  voice: g2pReviewVoiceSchema,
  kana: z.string().optional(),
  /** kana とは別に、聞いて自然だった kana。評価ではどれと一致しても正解にする。 */
  alternatives: z.array(z.string()).default([]),
  reviewed: z.boolean(),
});

export const g2pReviewSetSchema = z.object({
  items: z.array(g2pReviewItemSchema),
});

export type G2pReviewItem = z.infer<typeof g2pReviewItemSchema>;
export type G2pReviewSet = z.infer<typeof g2pReviewSetSchema>;
