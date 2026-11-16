import { z } from "zod";
import {
  formatParentWorkIdsInput,
  normalizeNiconicoMeta,
  parseParentWorkIdsInput,
  type ProjectNiconicoMeta,
} from "@/app/features/project/lib/normalize-project-meta";
import type { PageFormValues } from "@/app/features/page/model/page-form-schema";
import type { TransitionFormValues } from "@/app/features/page/model/transition-form-schema";

import { createNiconicoTags, getConfiguredNiconicoTags } from "./niconico-tags";

const NICONICO_VIDEO_ID_PATTERN = /^\/(?:watch\/(sm\d+)|shorts\/(ss\d+))(?:[/?#]|$)/;

export function extractNiconicoVideoId(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      (parsed.hostname !== "www.nicovideo.jp" && parsed.hostname !== "nicovideo.jp")
    ) {
      return undefined;
    }
    const match = parsed.pathname.match(NICONICO_VIDEO_ID_PATTERN);
    return match?.[1] ?? match?.[2];
  } catch {
    return undefined;
  }
}

function collectNiconicoParentWorkIds(urls: string[]) {
  return [
    ...new Set(
      urls.flatMap((url) => {
        const id = extractNiconicoVideoId(url);
        return id ? [id] : [];
      }),
    ),
  ];
}

function parseTagsInput(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/\s+/u)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
}

export const niconicoFormSchema = z.object({
  title: z.string(),
  description: z.string(),
  thumbnailTime: z.string(),
  parentWorkIds: z.string(),
  fixedParentWorkIds: z.string(),
  tags: z.string().refine((value) => parseTagsInput(value).length <= 6, {
    message: "Up to 6 tags",
  }),
});

export type NiconicoFormValues = z.infer<typeof niconicoFormSchema>;

export function toNiconicoFormValues(niconico: ProjectNiconicoMeta): NiconicoFormValues {
  const normalized = normalizeNiconicoMeta(niconico);
  return {
    title: normalized.title,
    description: normalized.description,
    thumbnailTime: normalized.thumbnailTime,
    parentWorkIds: formatParentWorkIdsInput(normalized.parentWorkIds),
    fixedParentWorkIds: formatParentWorkIdsInput(normalized.fixedParentWorkIds),
    tags: getConfiguredNiconicoTags(normalized.tags).join(" "),
  };
}

export function fromNiconicoFormValues(values: NiconicoFormValues): ProjectNiconicoMeta {
  return normalizeNiconicoMeta({
    title: values.title,
    description: values.description,
    thumbnailTime: values.thumbnailTime,
    parentWorkIds: parseParentWorkIdsInput(values.parentWorkIds),
    fixedParentWorkIds: parseParentWorkIdsInput(values.fixedParentWorkIds),
    tags: createNiconicoTags(parseTagsInput(values.tags)),
  });
}

export function parentWorkIdsInputFromOutroItems(
  items: Iterable<PageFormValues | TransitionFormValues>,
) {
  const urls: string[] = [];
  for (const item of items) {
    if (item.type !== "outro") {
      continue;
    }
    for (const block of item.meta.blocks) {
      urls.push(block.url);
    }
  }
  return formatParentWorkIdsInput(collectNiconicoParentWorkIds(urls));
}
