import { z } from "zod";
import {
  commentGroupSchema,
  commentSceneSchema,
  commentsPageMetaSchema,
  niconicoCommentSchema,
  refineCommentsPageRelations,
} from "@/_schemas/project/comments";
import {
  endcardPageMetaSchema,
  outroPageMetaSchema,
  mainPageMetaSchema,
  pageTagsMetaSchema,
  transitionVariantSchema,
} from "@/_schemas/project/primitives";
import { savedTtsSchema } from "@/_schemas/project/tts";

const savedPageSharedSchema = {
  id: z.string().min(1),
  title: z.string().default(""),
  padBeforeSec: z.number().nonnegative(),
  padAfterSec: z.number().nonnegative(),
  richText: z.string().nullable(),
};

export const savedPageSchema = z.discriminatedUnion("type", [
  z.object({
    ...savedPageSharedSchema,
    type: z.literal("intro"),
    meta: pageTagsMetaSchema,
    tts: z.array(savedTtsSchema).min(1),
  }),
  z.object({
    ...savedPageSharedSchema,
    type: z.literal("eyecatch-text"),
    meta: pageTagsMetaSchema,
    tts: z.array(savedTtsSchema),
  }),
  z.object({
    ...savedPageSharedSchema,
    type: z.literal("main"),
    meta: mainPageMetaSchema,
    tts: z.array(savedTtsSchema).min(1),
  }),
  z
    .object({
      ...savedPageSharedSchema,
      type: z.literal("comments"),
      richText: z.null(),
      meta: commentsPageMetaSchema,
      comments: z.array(niconicoCommentSchema),
      commentGroups: z.array(commentGroupSchema),
      commentScenes: z.array(commentSceneSchema).default([]),
      tts: z.array(savedTtsSchema),
    })
    .superRefine(refineCommentsPageRelations),
  z.object({
    ...savedPageSharedSchema,
    type: z.literal("outro"),
    meta: outroPageMetaSchema,
    tts: z.array(savedTtsSchema),
  }),
  z.object({
    ...savedPageSharedSchema,
    type: z.literal("endcard"),
    meta: endcardPageMetaSchema,
    tts: z.array(savedTtsSchema),
  }),
]);

export const savedTransitionSchema = z.object({
  id: z.string().min(1),
  type: z.literal("transition"),
  variant: transitionVariantSchema,
});

export const savedSequenceItemSchema = z.union([savedPageSchema, savedTransitionSchema]);

export type SavedPage = z.infer<typeof savedPageSchema>;
export type SavedTransition = z.infer<typeof savedTransitionSchema>;
export type SavedSequenceItem = z.infer<typeof savedSequenceItemSchema>;
export type SavedMainPage = Extract<SavedPage, { type: "main" }>;
export type SavedEyecatchTextPage = Extract<SavedPage, { type: "eyecatch-text" }>;
export type SavedCommentsPage = Extract<SavedPage, { type: "comments" }>;
export type SavedOutroPage = Extract<SavedPage, { type: "outro" }>;
export type SavedEndcardPage = Extract<SavedPage, { type: "endcard" }>;
