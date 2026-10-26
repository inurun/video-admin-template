import { z } from "zod";
import type { CommentsPresentation } from "@/_schemas/project/comments";
import {
  AVATAR_TYPES,
  avatarOverrideSchema,
  avatarTypeSchema,
  getAvatarTypeForVoice,
  type AvatarType,
  type MainPageMeta,
} from "@/_schemas";
import { toAvatarOverride } from "@/app/features/tts/lib/avatar-override";

export const pageSettingsFormSchema = z.object({
  title: z.string(),
  tags: z.array(
    z.object({
      value: z.string().trim().min(1, "Tag is required"),
    }),
  ),
  presentation: z.enum(["single", "triple"]),
  avatars: z.partialRecord(avatarTypeSchema, avatarOverrideSchema),
});

export type PageSettingsFormValues = z.infer<typeof pageSettingsFormSchema>;

export function toPageSettingsFormValues({
  title,
  tags,
  presentation = "single",
  avatars = {},
}: {
  title: string;
  tags: readonly string[];
  presentation?: CommentsPresentation;
  avatars?: MainPageMeta["avatars"];
}): PageSettingsFormValues {
  return {
    title,
    tags: tags.map((value) => ({ value })),
    presentation,
    avatars,
  };
}

export function getSelectedPageSettingsFormValues(
  page: {
    title: string;
    meta: {
      tags: readonly string[];
      presentation?: CommentsPresentation;
      avatars?: MainPageMeta["avatars"];
    };
  } | null,
): PageSettingsFormValues {
  if (!page) {
    return toPageSettingsFormValues({ title: "", tags: [] });
  }

  return toPageSettingsFormValues({
    title: page.title,
    tags: page.meta.tags,
    presentation: page.meta.presentation ?? "single",
    avatars: page.meta.avatars,
  });
}

export function getPageSettingsTags(values: PageSettingsFormValues): string[] {
  return values.tags.map((tag) => tag.value.trim());
}

export function toMainPageMeta(values: PageSettingsFormValues): MainPageMeta {
  const avatars = Object.fromEntries(
    AVATAR_TYPES.flatMap((type) => {
      const override = toAvatarOverride(values.avatars[type]);
      return override ? [[type, override]] : [];
    }),
  );
  return {
    tags: getPageSettingsTags(values),
    ...(Object.keys(avatars).length > 0 ? { avatars } : {}),
  };
}

/** Avatars speaking on the page plus any with a saved default, in catalog order. */
export function getPageAvatarTypes(
  tts: readonly Parameters<typeof getAvatarTypeForVoice>[0][],
  avatars: MainPageMeta["avatars"],
): AvatarType[] {
  const used = new Set<AvatarType>([
    ...tts.map((item) => getAvatarTypeForVoice(item)),
    ...(Object.keys(avatars ?? {}) as AvatarType[]),
  ]);
  return AVATAR_TYPES.filter((type) => used.has(type));
}
