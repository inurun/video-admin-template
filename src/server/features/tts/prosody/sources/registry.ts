import type { ProsodySourceId } from "@/video-host/contract";
import { drama3Source } from "./drama3";
import { elevenV4TurboSource } from "./eleven";
import type { ProsodySourceAdapter } from "./types";

export const prosodySources = {
  "eleven-v4-turbo": elevenV4TurboSource,
  "drama-3": drama3Source,
} satisfies Record<ProsodySourceId, ProsodySourceAdapter>;

export function getProsodySourceAdapter(id: ProsodySourceId): ProsodySourceAdapter {
  return prosodySources[id];
}
