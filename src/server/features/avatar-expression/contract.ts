import { z } from "zod";
import { avatarOverrideSchema, avatarSourceSchema, avatarTypeSchema } from "@/_schemas";

const pageAvatarsSchema = z.partialRecord(avatarTypeSchema, avatarOverrideSchema);

export const avatarExpressionGenerateRequestSchema = z.object({
  projectPath: z.string().min(1),
  page: z.object({
    title: z.string(),
    avatars: pageAvatarsSchema.optional(),
    tts: z.array(
      z.object({
        id: z.string().min(1),
        text: z.string(),
        provider: z.string().optional(),
        voiceName: z.string().optional(),
        speakerUuid: z.string().optional(),
        avatar: avatarOverrideSchema.optional(),
      }),
    ),
  }),
});

export const avatarExpressionGenerateResponseSchema = z.object({
  avatars: pageAvatarsSchema,
  /** Every line of the turns auto looked at; null = no override. Each becomes auto-owned. */
  tts: z.array(
    z.object({
      id: z.string().min(1),
      avatar: avatarOverrideSchema.nullable(),
      avatarSource: avatarSourceSchema,
    }),
  ),
});

export type AvatarExpressionGenerateRequest = z.infer<typeof avatarExpressionGenerateRequestSchema>;
export type AvatarExpressionGenerateResponse = z.infer<
  typeof avatarExpressionGenerateResponseSchema
>;
