import { getVoiceId, toVoiceIdentity, type SavedSequenceItem, type SavedTts } from "@/_schemas";
import { listSavedPageTtsInPlaybackOrder } from "@/server/features/project/comments-playback";
import { getEffectiveReadText } from "@/server/features/tts/providers/comparison";
import type { ProsodyContextConfig } from "@/video-host/contract";
import type { ProsodySourceContext } from "./sources/types";

/** One line as the reference TTS hears it around another; `speaker` is its voice id. */
export type ProsodyContextLine = { id: string; text: string; speaker: string };

const SEPARATOR = " ";

export function toProsodyContextLine(
  item: Pick<SavedTts, "id" | "text" | "readText"> & Parameters<typeof toVoiceIdentity>[0],
): ProsodyContextLine {
  const identity = toVoiceIdentity(item);
  return {
    id: item.id,
    text: getEffectiveReadText(item),
    speaker: identity ? getVoiceId(identity) : item.provider,
  };
}

/** The lines of each page (each comment group) in playback order. */
export function listProsodyContextGroups(
  pages: readonly SavedSequenceItem[],
): ProsodyContextLine[][] {
  return pages.flatMap((page) => {
    if (page.type === "transition") {
      return [];
    }
    if (page.type === "comments") {
      return page.commentGroups.map((group) =>
        listSavedPageTtsInPlaybackOrder({
          ...page,
          commentGroups: [group],
          commentScenes: [{ id: group.id, groupIds: [group.id] }],
        }).map(toProsodyContextLine),
      );
    }
    return [page.tts.map(toProsodyContextLine)];
  });
}

function contextRange(
  lines: readonly ProsodyContextLine[],
  index: number,
  config: ProsodyContextConfig,
): [from: number, to: number] {
  switch (config.kind) {
    case "none":
      return [index, index + 1];
    case "neighbors":
      return [Math.max(index - config.utterances, 0), index + 1 + config.utterances];
    case "block": {
      const speaker = lines[index]!.speaker;
      let from = index;
      while (from > 0 && lines[from - 1]!.speaker === speaker) {
        from -= 1;
      }
      let to = index + 1;
      while (to < lines.length && lines[to]!.speaker === speaker) {
        to += 1;
      }
      return [from, to];
    }
  }
}

/** The context of `lines[index]`, or `undefined` when it hears nothing around it. */
export function prosodyContextAt(
  lines: readonly ProsodyContextLine[],
  index: number,
  config: ProsodyContextConfig,
): ProsodySourceContext | undefined {
  const [from, to] = contextRange(lines, index, config);
  const join = (part: readonly ProsodyContextLine[]) =>
    part.map((line) => line.text).join(SEPARATOR);
  const previous = join(lines.slice(from, index));
  const next = join(lines.slice(index + 1, to));
  if (!previous && !next) {
    return undefined;
  }
  return { ...(previous ? { previous } : {}), ...(next ? { next } : {}) };
}

/** The context of each target line, keyed by its tts id. */
export function prosodyContexts(
  pages: readonly SavedSequenceItem[],
  targetIds: ReadonlySet<string>,
  config: ProsodyContextConfig,
): Map<string, ProsodySourceContext> {
  const contexts = new Map<string, ProsodySourceContext>();
  for (const lines of listProsodyContextGroups(pages)) {
    lines.forEach((line, index) => {
      if (!targetIds.has(line.id)) {
        return;
      }
      const context = prosodyContextAt(lines, index, config);
      if (context) {
        contexts.set(line.id, context);
      }
    });
  }
  return contexts;
}

/**
 * The context of a line being edited: its saved page (comment group) with the line replaced by
 * the edited one. A line not saved yet hears nothing.
 */
export function prosodyContextOfEdited(
  pages: readonly SavedSequenceItem[],
  edited: ProsodyContextLine,
  config: ProsodyContextConfig,
): ProsodySourceContext | undefined {
  for (const lines of listProsodyContextGroups(pages)) {
    const index = lines.findIndex((line) => line.id === edited.id);
    if (index >= 0) {
      const replaced = lines.map((line, at) => (at === index ? edited : line));
      return prosodyContextAt(replaced, index, config);
    }
  }
  return undefined;
}
