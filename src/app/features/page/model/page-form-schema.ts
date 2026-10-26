import { z } from "zod";
import { ttsFormSchema } from "@/app/features/tts/model/tts-form-schema";
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
} from "@/_schemas/project/primitives";

const pageFormSharedFields = {
  id: z.string().min(1),
  title: z.string(),
  padBeforeSec: z.number().nonnegative(),
  padAfterSec: z.number().nonnegative(),
  richText: z.string().nullable(),
  tts: z.array(ttsFormSchema),
};

export const pageFormSchema = z.discriminatedUnion("type", [
  z.object({
    ...pageFormSharedFields,
    type: z.literal("intro"),
    meta: pageTagsMetaSchema,
  }),
  z.object({
    ...pageFormSharedFields,
    type: z.literal("eyecatch-text"),
    meta: pageTagsMetaSchema,
  }),
  z.object({
    ...pageFormSharedFields,
    type: z.literal("main"),
    meta: mainPageMetaSchema,
  }),
  z
    .object({
      ...pageFormSharedFields,
      type: z.literal("comments"),
      richText: z.null(),
      meta: commentsPageMetaSchema,
      comments: z.array(niconicoCommentSchema),
      commentGroups: z.array(commentGroupSchema),
      commentScenes: z.array(commentSceneSchema).default([]),
    })
    .superRefine(refineCommentsPageRelations),
  z.object({
    ...pageFormSharedFields,
    type: z.literal("outro"),
    meta: outroPageMetaSchema,
  }),
  z.object({
    ...pageFormSharedFields,
    type: z.literal("endcard"),
    meta: endcardPageMetaSchema,
  }),
]);

export type PageFormValues = z.infer<typeof pageFormSchema>;
export type MainPageFormValues = Extract<PageFormValues, { type: "main" }>;
export type EyecatchTextPageFormValues = Extract<PageFormValues, { type: "eyecatch-text" }>;
export type CommentsPageFormValues = Extract<PageFormValues, { type: "comments" }>;
export type OutroPageFormValues = Extract<PageFormValues, { type: "outro" }>;
export type EndcardPageFormValues = Extract<PageFormValues, { type: "endcard" }>;
