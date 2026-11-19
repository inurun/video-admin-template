import { z } from "zod";
import { savedProjectSchema } from "@/_schemas";
import { g2pItemSchema } from "@/_schemas/g2p";
import { savedTimelineSchema } from "@/_schemas/timeline";
import {
  commentGroupSchema,
  commentSceneSchema,
  commentsPageMetaSchema,
  niconicoCommentSchema,
  refineCommentsPageRelations,
} from "@/_schemas/project/comments";
import {
  avatarOverrideSchema,
  avatarSourceSchema,
  bgmTrackSchema,
  DEFAULT_VOICE_PRESETS,
  endcardPageMetaSchema,
  outroPageMetaSchema,
  mainPageMetaSchema,
  pageTagsMetaSchema,
  projectNiconicoMetaSchema,
  transitionVariantSchema,
  coeiroinkSynthesisSettingsSchema,
  voicepeakSynthesisSettingsSchema,
  voicePresetSchema,
  voicevoxSynthesisSettingsSchema,
  voisonaSynthesisSettingsSchema,
  weatherForecastsSchema,
} from "@/_schemas/project/primitives";

const saveTtsSpeechSchema = z.object({
  g2p: g2pItemSchema.optional(),
});

const saveTtsBaseFields = {
  id: z.string().min(1),
  text: z.string(),
  readText: z.string().optional(),
  padBeforeSec: z.number().default(0),
  padAfterSec: z.number().default(0),
  volume: z.number().min(0).max(1).default(1),
  speech: saveTtsSpeechSchema.optional(),
  avatar: avatarOverrideSchema.optional(),
  avatarSource: avatarSourceSchema.optional(),
};

const namedSaveTtsIdentity = {
  voiceName: z.string().optional(),
  voiceVersion: z.string().optional(),
};

const coeiroinkSaveTtsIdentity = {
  speakerUuid: z.string().min(1),
  styleId: z.number().int(),
  modelVersion: z.string().min(1),
};

export const saveTtsItemSchema = z.discriminatedUnion("provider", [
  z.object({
    ...saveTtsBaseFields,
    ...namedSaveTtsIdentity,
    provider: z.literal("voisona"),
    synthesisSettings: voisonaSynthesisSettingsSchema.nullish(),
  }),
  z.object({
    ...saveTtsBaseFields,
    ...namedSaveTtsIdentity,
    provider: z.literal("voicevox"),
    synthesisSettings: voicevoxSynthesisSettingsSchema.nullish(),
  }),
  z.object({
    ...saveTtsBaseFields,
    ...namedSaveTtsIdentity,
    provider: z.literal("voicepeak"),
    synthesisSettings: voicepeakSynthesisSettingsSchema.nullish(),
  }),
  z.object({
    ...saveTtsBaseFields,
    ...coeiroinkSaveTtsIdentity,
    provider: z.literal("coeiroink"),
    synthesisSettings: coeiroinkSynthesisSettingsSchema.nullish(),
  }),
]);

const savePageSharedFields = {
  id: z.string().min(1),
  title: z.string(),
  padBeforeSec: z.number().nonnegative(),
  padAfterSec: z.number().nonnegative(),
  richText: z.string().nullable(),
  tts: z.array(saveTtsItemSchema),
};

export const savePageItemSchema = z.discriminatedUnion("type", [
  z.object({
    ...savePageSharedFields,
    type: z.literal("intro"),
    meta: pageTagsMetaSchema,
  }),
  z.object({
    ...savePageSharedFields,
    type: z.literal("eyecatch-text"),
    meta: pageTagsMetaSchema,
  }),
  z.object({
    ...savePageSharedFields,
    type: z.literal("main"),
    meta: mainPageMetaSchema,
  }),
  z
    .object({
      ...savePageSharedFields,
      type: z.literal("comments"),
      richText: z.null(),
      meta: commentsPageMetaSchema,
      comments: z.array(niconicoCommentSchema),
      commentGroups: z.array(commentGroupSchema),
      commentScenes: z.array(commentSceneSchema).default([]),
    })
    .superRefine(refineCommentsPageRelations),
  z.object({
    ...savePageSharedFields,
    type: z.literal("outro"),
    meta: outroPageMetaSchema,
  }),
  z.object({
    ...savePageSharedFields,
    type: z.literal("endcard"),
    meta: endcardPageMetaSchema,
  }),
]);

export const saveTransitionItemSchema = z.object({
  id: z.string().min(1),
  type: z.literal("transition"),
  variant: transitionVariantSchema,
});

export const saveSequenceItemSchema = z.union([savePageItemSchema, saveTransitionItemSchema]);

export const saveProjectSettingsSchema = z.object({
  meta: z.object({
    title: z.string(),
    description: z.string(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    updatedAt: z.iso.datetime({ offset: true }).optional(),
    weather: weatherForecastsSchema,
    niconico: projectNiconicoMetaSchema,
  }),
  bgm: z.array(bgmTrackSchema).default([]),
  voicePresets: z.record(z.string(), voicePresetSchema).default(DEFAULT_VOICE_PRESETS),
});

export const saveProjectChangesRequestSchema = z.object({
  project: saveProjectSettingsSchema.optional(),
  upsertItems: z.array(saveSequenceItemSchema),
  removedItemIds: z.array(z.string().min(1)),
  sequenceOrder: z.array(z.string().min(1)).optional(),
  forceResynthesis: z.boolean().optional(),
});

export const createProjectRequestSchema = z.object({
  projectPath: z.string().min(1),
});

export const copyProjectRequestSchema = z.object({
  sourceProjectPath: z.string().min(1),
  targetProjectPath: z.string().min(1),
});

export const projectFileSummarySchema = z.object({
  path: z.string().min(1),
  name: z.string().min(1),
  segments: z.array(z.string().min(1)),
  updatedAt: z.number().int().nonnegative(),
});

export const saveProjectChangesResponseSchema = z.object({
  project: savedProjectSchema,
  timeline: savedTimelineSchema,
  updatedItemIds: z.array(z.string().min(1)),
});

export const savedProjectDocumentSchema = z.object({
  project: savedProjectSchema,
  timeline: savedTimelineSchema,
});

export const projectContract = {
  list: {
    response: projectFileSummarySchema.array(),
  },
  create: {
    json: createProjectRequestSchema,
    response: projectFileSummarySchema,
  },
  copy: {
    json: copyProjectRequestSchema,
    response: projectFileSummarySchema,
  },
  get: {
    response: savedProjectDocumentSchema,
  },
  save: {
    json: saveProjectChangesRequestSchema,
    response: saveProjectChangesResponseSchema,
  },
};

export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export type CopyProjectRequest = z.infer<typeof copyProjectRequestSchema>;
export type ProjectFileSummary = z.infer<typeof projectFileSummarySchema>;
export type SavedProjectDocument = z.infer<typeof savedProjectDocumentSchema>;

export type SaveTtsItem = z.infer<typeof saveTtsItemSchema>;
export type SavePageItem = z.infer<typeof savePageItemSchema>;
export type SaveTransitionItem = z.infer<typeof saveTransitionItemSchema>;
export type SaveSequenceItem = z.infer<typeof saveSequenceItemSchema>;
export type SaveProjectSettings = z.infer<typeof saveProjectSettingsSchema>;
export type SaveProjectChangesRequest = z.infer<typeof saveProjectChangesRequestSchema>;
export type SaveProjectChangesResponse = z.infer<typeof saveProjectChangesResponseSchema>;

export function isSaveTransitionItem(item: SaveSequenceItem): item is SaveTransitionItem {
  return item.type === "transition";
}

export function isSavePageItem(item: SaveSequenceItem): item is SavePageItem {
  return item.type !== "transition";
}
