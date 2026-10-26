import type { CommentGroup, CommentScene, NiconicoComment } from "@/_schemas/project/comments";
import type { AvatarOverride } from "@/_schemas";
import type { CommentsPageFormValues } from "@/app/features/page/model/page-form-schema";
import type { TtsFormValues } from "@/app/features/tts/model/tts-form-schema";
import { ttsVoiceId } from "@/_schemas";
import { toAvatarOverride } from "@/app/features/tts/lib/avatar-override";
import { createVoiceAliasMap } from "@/app/features/zen/create-alias-map";
import { serializeAvatarTokens } from "@/app/features/zen/avatar-tokens";
import { extractInlineTags, uniqueTags } from "@/app/features/zen/tag-utils";
import { parseAvatarTokens } from "@/app/features/zen/avatar-tokens";
import { normalizeSpeechText } from "@/app/features/zen/handlers/speech";
import { applyTtsTextChange, applyTtsVoiceChange } from "@/app/features/tts";
import { createZenTts } from "@/app/features/zen/create-zen-tts";
import { cloneCommentsPage } from "@/app/features/comments/comment-operations";
import type { ZenAliasTarget, ZenParseError } from "@/app/features/zen/types";

const TTS_REF_PATTERN = /^\{#tts:([^}]+)\}$/;

export type ZenCommentsReplyDraft = {
  alias: string;
  avatar: AvatarOverride | undefined;
  text: string;
  ttsId: string | null;
  lineNumber: number;
};

export type ZenCommentsGroupDraft = {
  commentIds: string[];
  commentBodies: Record<string, string>;
  replies: ZenCommentsReplyDraft[];
};

export type ZenCommentsSceneDraft = {
  groups: ZenCommentsGroupDraft[];
};

export type ParseZenCommentsPageResult = {
  title: string;
  tags: string[];
  scenes: ZenCommentsSceneDraft[];
  groups: ZenCommentsGroupDraft[];
  errors: ZenParseError[];
};

function escapeCommentBody(body: string) {
  return body.replaceAll("\\", "\\\\").replaceAll("\n", "\\n");
}

function unescapeCommentBody(body: string) {
  let result = "";
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char !== "\\") {
      result += char;
      continue;
    }
    const next = body[index + 1];
    if (next === "n") {
      result += "\n";
      index += 1;
      continue;
    }
    if (next === "\\") {
      result += "\\";
      index += 1;
      continue;
    }
    result += char;
  }
  return result;
}

function escapeSpeechLine(text: string) {
  const serialized = text.replaceAll("\n", "  ");
  if (/^[>@#\\]/.test(serialized) || serialized.startsWith("---")) {
    return `\\${serialized}`;
  }
  return serialized;
}

function resolveAlias(item: TtsFormValues, voiceAliases: Map<string, string>) {
  const voiceId = ttsVoiceId(item);
  return (
    voiceAliases.get(voiceId) ??
    (item.provider === "coeiroink" ? item.speakerUuid : item.voiceName) ??
    "unknown"
  );
}

export function serializeZenCommentsPage(
  page: CommentsPageFormValues,
  aliases: Map<string, ZenAliasTarget>,
) {
  const voiceAliases = createVoiceAliasMap(aliases);
  const commentsById = new Map(page.comments.map((comment) => [comment.id, comment]));
  const groupsById = new Map(page.commentGroups.map((group) => [group.id, group]));
  const ttsById = new Map(page.tts.map((item) => [item.id, item]));
  const lines: string[] = [];
  const title = page.title.trim();
  if (title) {
    lines.push(`# ${title}`);
  }
  const tags = page.meta.tags.filter(Boolean);
  if (tags.length > 0) {
    lines.push(tags.map((tag) => `#${tag}`).join(" "));
  }

  for (const [sceneIndex, scene] of page.commentScenes.entries()) {
    if (sceneIndex > 0) {
      if (lines.length > 0) {
        lines.push("");
      }
      lines.push("---");
    }
    for (const groupId of scene.groupIds) {
      const group = groupsById.get(groupId);
      if (!group) {
        continue;
      }
      if (lines.length > 0) {
        lines.push("");
      }
      for (const commentId of group.commentIds) {
        const comment = commentsById.get(commentId);
        const body = escapeCommentBody(comment?.body ?? "");
        lines.push(`> [${commentId}] ${body}`);
      }
      let lastKey = "";
      for (const ttsId of group.ttsIds) {
        const item = ttsById.get(ttsId);
        if (!item) {
          continue;
        }
        const alias = resolveAlias(item, voiceAliases);
        const avatar = toAvatarOverride(item.avatar);
        const tokens = serializeAvatarTokens(avatar);
        const key = `${alias}\0${tokens}`;
        if (key !== lastKey) {
          const extras = [tokens, `{#tts:${item.id}}`].filter(Boolean).join(" ");
          lines.push(`@${alias}${extras ? ` ${extras}` : ""}`);
          lastKey = key;
        }
        lines.push(escapeSpeechLine(item.text));
      }
    }
  }

  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

function parseQuoteLine(line: string) {
  const match = /^>\s*(.*)$/.exec(line);
  if (!match) {
    return null;
  }
  const rest = match[1] ?? "";
  if (rest.startsWith("[")) {
    const idMatch = /^\[([^\]]+)\]\s*(.*)$/.exec(rest);
    if (!idMatch) {
      return { kind: "invalid-id" as const };
    }
    return {
      kind: "id" as const,
      id: idMatch[1] ?? "",
      body: unescapeCommentBody((idMatch[2] ?? "").trimEnd()),
    };
  }
  return { kind: "body" as const, body: unescapeCommentBody(rest.trimEnd()) };
}

function resolveBodyComment(
  body: string,
  inserted: NiconicoComment[],
  used: Set<string>,
): string | null {
  const matches = inserted.filter((comment) => comment.body === body && !used.has(comment.id));
  if (matches.length !== 1) {
    return null;
  }
  return matches[0]?.id ?? null;
}

export function parseZenCommentsPage(
  source: string,
  options: {
    aliases: Map<string, ZenAliasTarget>;
    insertedComments: NiconicoComment[];
    knownTtsIds: ReadonlySet<string>;
  },
): ParseZenCommentsPageResult {
  const errors: ZenParseError[] = [];
  const commentsById = new Map(options.insertedComments.map((comment) => [comment.id, comment]));
  const usedComments = new Set<string>();
  const usedTtsRefs = new Set<string>();
  let title = "";
  let tags: string[] = [];
  let commentsStarted = false;
  const sceneGroups: ZenCommentsGroupDraft[][] = [[]];
  let sceneIndex = 0;
  const groups: ZenCommentsGroupDraft[] = [];
  let current: ZenCommentsGroupDraft | null = null;
  let currentSpeaker: ZenCommentsReplyDraft | null = null;
  let pendingSpeaker = false;
  let blankPending = false;
  let lastSceneBreakLine = 0;

  const startGroup = (lineNumber: number): ZenCommentsGroupDraft | null => {
    const scene = sceneGroups[sceneIndex];
    if (!scene) {
      return null;
    }
    if (scene.length >= 3) {
      errors.push({ line: lineNumber, message: "A comment scene can have at most 3 groups." });
      return null;
    }
    const group: ZenCommentsGroupDraft = { commentIds: [], commentBodies: {}, replies: [] };
    groups.push(group);
    scene.push(group);
    current = group;
    currentSpeaker = null;
    pendingSpeaker = false;
    return group;
  };

  const lines = source.replace(/\r\n/g, "\n").split("\n");
  for (const [index, rawLine] of lines.entries()) {
    const lineNumber = index + 1;
    const line = rawLine.trimEnd();
    if (line.trim() === "") {
      if (current && current.commentIds.length > 0) {
        blankPending = true;
      }
      continue;
    }

    if (line.trim() === "---") {
      commentsStarted = true;
      const scene = sceneGroups[sceneIndex];
      if (!scene || scene.length === 0) {
        errors.push({ line: lineNumber, message: "Empty comment scene." });
        continue;
      }
      sceneGroups.push([]);
      sceneIndex += 1;
      lastSceneBreakLine = lineNumber;
      current = null;
      currentSpeaker = null;
      pendingSpeaker = false;
      blankPending = false;
      continue;
    }

    const escaped = line.startsWith("\\");
    const content = escaped ? line.slice(1) : line;

    if (!escaped && /^#\s+\S/.test(line)) {
      if (commentsStarted) {
        errors.push({
          line: lineNumber,
          message: "Page heading must appear before comments.",
        });
        continue;
      }
      const rest = line.replace(/^#\s+/, "");
      const parsed = extractInlineTags(rest);
      title = parsed.title;
      tags = uniqueTags([...tags, ...parsed.tags]);
      continue;
    }

    if (
      !escaped &&
      line
        .split(/\s+/)
        .filter(Boolean)
        .every((token) => /^#[^\s#]+$/.test(token))
    ) {
      if (commentsStarted) {
        errors.push({ line: lineNumber, message: "Tags must appear before comments." });
        continue;
      }
      const nextTags = line
        .split(/\s+/)
        .filter(Boolean)
        .map((token) => token.slice(1));
      tags = uniqueTags([...tags, ...nextTags]);
      continue;
    }

    const quote = !escaped ? parseQuoteLine(line) : null;
    if (quote) {
      commentsStarted = true;
      if (quote.kind === "invalid-id") {
        errors.push({ line: lineNumber, message: "Invalid comment reference." });
        continue;
      }
      if (
        !current ||
        current.replies.length > 0 ||
        (blankPending && current.commentIds.length > 0 && !pendingSpeaker)
      ) {
        current = startGroup(lineNumber);
        if (!current) {
          continue;
        }
      }
      blankPending = false;
      currentSpeaker = null;
      pendingSpeaker = false;
      const group = current;
      if (quote.kind === "id") {
        if (!quote.id) {
          errors.push({ line: lineNumber, message: "Empty comment reference." });
          continue;
        }
        const comment = commentsById.get(quote.id);
        if (!comment) {
          errors.push({
            line: lineNumber,
            message: "Unknown comment id. Insert it from Page settings first.",
          });
          continue;
        }
        if (usedComments.has(quote.id)) {
          errors.push({ line: lineNumber, message: "Comment is referenced more than once." });
          continue;
        }
        usedComments.add(quote.id);
        group.commentIds.push(quote.id);
        if (quote.body.length > 0) {
          group.commentBodies[quote.id] = quote.body;
        }
        continue;
      }
      if (!quote.body.trim()) {
        errors.push({ line: lineNumber, message: "Empty quote." });
        continue;
      }
      const resolved = resolveBodyComment(quote.body, options.insertedComments, usedComments);
      if (!resolved) {
        errors.push({
          line: lineNumber,
          message: "Comment text is ambiguous or not inserted. Use a [id] reference.",
        });
        continue;
      }
      usedComments.add(resolved);
      group.commentIds.push(resolved);
      continue;
    }

    if (!escaped && /^@\S/.test(line)) {
      if (!current || current.commentIds.length === 0) {
        errors.push({ line: lineNumber, message: "Reply is missing a comment group." });
        continue;
      }
      if (pendingSpeaker) {
        errors.push({ line: lineNumber, message: "Speaker is missing speech text." });
      }
      const tokens = line.trim().split(/\s+/);
      const alias = tokens[0]?.slice(1) ?? "";
      const target = options.aliases.get(alias);
      if (!target) {
        errors.push({ line: lineNumber, message: `Unknown alias "@${alias}".` });
        continue;
      }
      const rest = tokens.slice(1);
      let ttsId: string | null = null;
      const avatarTokens: string[] = [];
      for (const token of rest) {
        const ref = TTS_REF_PATTERN.exec(token);
        if (ref) {
          ttsId = ref[1] ?? null;
          continue;
        }
        avatarTokens.push(token);
      }
      if (ttsId) {
        if (usedTtsRefs.has(ttsId)) {
          errors.push({ line: lineNumber, message: "TTS id is referenced more than once." });
          continue;
        }
        if (!options.knownTtsIds.has(ttsId)) {
          errors.push({ line: lineNumber, message: "Unknown TTS id." });
          continue;
        }
        usedTtsRefs.add(ttsId);
      }
      let avatar: AvatarOverride | undefined;
      try {
        avatar = parseAvatarTokens(avatarTokens, target.avatarType);
      } catch (error) {
        errors.push({ line: lineNumber, message: (error as Error).message });
        continue;
      }
      currentSpeaker = {
        alias,
        avatar,
        text: "",
        ttsId,
        lineNumber,
      };
      pendingSpeaker = true;
      blankPending = false;
      continue;
    }

    if (!current || current.commentIds.length === 0) {
      errors.push({ line: lineNumber, message: "Speech requires a comment group first." });
      continue;
    }
    if (!currentSpeaker) {
      errors.push({ line: lineNumber, message: "Speech requires a @speaker first." });
      continue;
    }
    const text = normalizeSpeechText(content);
    if (pendingSpeaker && currentSpeaker.text === "") {
      currentSpeaker.text = text;
      current.replies.push(currentSpeaker);
      pendingSpeaker = false;
      currentSpeaker = {
        ...currentSpeaker,
        text: "",
        ttsId: null,
        lineNumber,
      };
    } else {
      current.replies.push({
        ...currentSpeaker,
        text,
        ttsId: null,
        lineNumber,
      });
    }
    blankPending = false;
  }

  if (pendingSpeaker) {
    errors.push({ line: 0, message: "Speaker is missing speech text." });
  }

  const lastScene = sceneGroups[sceneIndex];
  if (sceneGroups.length > 1 && lastScene && lastScene.length === 0) {
    errors.push({ line: lastSceneBreakLine || 0, message: "Empty comment scene." });
  }

  const scenes: ZenCommentsSceneDraft[] =
    errors.length === 0
      ? sceneGroups.filter((scene) => scene.length > 0).map((scene) => ({ groups: scene }))
      : [];

  return {
    title,
    tags,
    scenes,
    groups: errors.length === 0 ? groups : [],
    errors,
  };
}

function groupIdSetKey(ids: readonly string[]) {
  return [...ids].sort().join("\0");
}

function sharedGroupCount(left: readonly string[], right: readonly string[]) {
  const ids = new Set(left);
  return right.reduce((count, id) => count + (ids.has(id) ? 1 : 0), 0);
}

function matchScenes(
  existing: CommentScene[],
  nextGroupIds: string[][],
): Array<CommentScene | undefined> {
  const unused = existing.map((scene, index) => ({ scene, index, used: false }));
  const matched: Array<CommentScene | undefined> = nextGroupIds.map(() => undefined);

  for (const [nextIndex, ids] of nextGroupIds.entries()) {
    const key = groupIdSetKey(ids);
    const found = unused.find((item) => !item.used && groupIdSetKey(item.scene.groupIds) === key);
    if (!found) {
      continue;
    }
    matched[nextIndex] = found.scene;
    found.used = true;
  }

  while (true) {
    let best: { nextIndex: number; oldIndex: number; shared: number } | null = null;
    for (const [nextIndex, ids] of nextGroupIds.entries()) {
      if (matched[nextIndex]) {
        continue;
      }
      for (const item of unused) {
        if (item.used) {
          continue;
        }
        const shared = sharedGroupCount(item.scene.groupIds, ids);
        if (shared === 0) {
          continue;
        }
        if (
          !best ||
          shared > best.shared ||
          (shared === best.shared && item.index < best.oldIndex) ||
          (shared === best.shared && item.index === best.oldIndex && nextIndex < best.nextIndex)
        ) {
          best = { nextIndex, oldIndex: item.index, shared };
        }
      }
    }
    if (!best) {
      break;
    }
    const item = unused.find((entry) => entry.index === best.oldIndex);
    if (!item) {
      break;
    }
    matched[best.nextIndex] = item.scene;
    item.used = true;
  }

  return matched;
}

function commentIdSetKey(ids: readonly string[]) {
  return [...ids].sort().join("\0");
}

function ttsVoiceKey(item: TtsFormValues) {
  return ttsVoiceId(item);
}

function speakerVoiceKey(alias: string, aliases: Map<string, ZenAliasTarget>) {
  const voice = aliases.get(alias)?.voice;
  if (!voice) {
    return "";
  }
  return ttsVoiceId(voice);
}

function matchGroups(
  existing: CommentGroup[],
  nextIds: string[][],
): Array<CommentGroup | undefined> {
  const unused = existing.map((group, index) => ({ group, index }));
  const matched: Array<CommentGroup | undefined> = nextIds.map(() => undefined);

  for (const [nextIndex, ids] of nextIds.entries()) {
    const key = commentIdSetKey(ids);
    const found = unused.findIndex(
      (item) => item && commentIdSetKey(item.group.commentIds) === key,
    );
    if (found < 0) {
      continue;
    }
    matched[nextIndex] = unused[found]?.group;
    unused.splice(found, 1);
  }

  for (const [nextIndex, ids] of nextIds.entries()) {
    if (matched[nextIndex]) {
      continue;
    }
    const head = ids[0];
    if (!head) {
      continue;
    }
    const found = unused.findIndex((item) => item.group.commentIds[0] === head);
    if (found < 0) {
      continue;
    }
    matched[nextIndex] = unused[found]?.group;
    unused.splice(found, 1);
  }

  return matched;
}

export function applyZenCommentsPage(
  existing: CommentsPageFormValues,
  parsed: ParseZenCommentsPageResult,
  aliases: Map<string, ZenAliasTarget>,
  editedGroupSettings: Record<string, { displayText: string | null }> = {},
): CommentsPageFormValues {
  const next = cloneCommentsPage(existing);
  next.title = parsed.title;
  next.meta = {
    ...next.meta,
    tags: [...parsed.tags],
  };
  const quotedBodies = new Map(
    parsed.groups.flatMap((group) => Object.entries(group.commentBodies)),
  );
  next.comments = next.comments.map((comment) => {
    const body = quotedBodies.get(comment.id);
    return body === undefined ? comment : { ...comment, body };
  });
  const voiceOptions = [...aliases.values()].map((target) => target.voice);
  const existingById = new Map(existing.tts.map((item) => [item.id, item]));
  const usedTts = new Set<string>();
  const matchedGroups = matchGroups(
    existing.commentGroups,
    parsed.groups.map((group) => group.commentIds),
  );

  const nextGroups: CommentGroup[] = [];
  const nextTts: TtsFormValues[] = [];

  const takeExisting = (id: string | null) => {
    if (!id || usedTts.has(id)) {
      return undefined;
    }
    const item = existingById.get(id);
    if (!item) {
      return undefined;
    }
    usedTts.add(id);
    return { ...item, speech: item.speech ?? {} };
  };

  const findUniqueReply = (alias: string, text: string, preferGroup: CommentGroup | undefined) => {
    const voiceKey = speakerVoiceKey(alias, aliases);
    const matchesIn = (group: CommentGroup | undefined) => {
      if (!group) {
        return [];
      }
      return group.ttsIds.flatMap((id) => {
        if (usedTts.has(id)) {
          return [];
        }
        const item = existingById.get(id);
        if (!item || item.text !== text || ttsVoiceKey(item) !== voiceKey) {
          return [];
        }
        return [item];
      });
    };
    const local = matchesIn(preferGroup);
    if (local.length === 1) {
      return takeExisting(local[0]?.id ?? null);
    }
    const global = existing.commentGroups.flatMap((group) => matchesIn(group));
    if (global.length === 1) {
      return takeExisting(global[0]?.id ?? null);
    }
    return undefined;
  };

  for (const [index, draft] of parsed.groups.entries()) {
    const previous = matchedGroups[index];
    const settings = previous ? editedGroupSettings[previous.id] : undefined;
    const group: CommentGroup = {
      id: previous?.id ?? crypto.randomUUID(),
      commentIds: [...draft.commentIds],
      displayText: settings?.displayText ?? previous?.displayText ?? null,
      ttsIds: [],
    };

    for (const reply of draft.replies) {
      const target = aliases.get(reply.alias);
      if (!target) {
        continue;
      }
      let item = reply.ttsId ? takeExisting(reply.ttsId) : undefined;
      if (!item) {
        item = findUniqueReply(reply.alias, reply.text, previous);
      }
      let resolved: TtsFormValues;
      if (item) {
        const voiceChanged = ttsVoiceKey(item) !== ttsVoiceId(target.voice);
        let next = voiceChanged ? applyTtsVoiceChange(item, target.voice) : item;
        if (next.text !== reply.text) {
          next = applyTtsTextChange(next, reply.text);
        }
        const { avatar: _avatar, ...rest } = next;
        resolved = {
          ...rest,
          ...(reply.avatar ? { avatar: reply.avatar } : {}),
          speech: next.speech ?? {},
        };
      } else {
        resolved = { ...createZenTts(voiceOptions, target, reply.text, reply.avatar), speech: {} };
      }
      group.ttsIds.push(resolved.id);
      nextTts.push(resolved);
    }

    nextGroups.push(group);
  }

  next.commentGroups = nextGroups;
  next.tts = nextTts;
  let offset = 0;
  const sceneGroupIds = parsed.scenes.map((scene) => {
    const ids = nextGroups.slice(offset, offset + scene.groups.length).map((group) => group.id);
    offset += scene.groups.length;
    return ids;
  });
  const matchedScenes = matchScenes(existing.commentScenes, sceneGroupIds);
  next.commentScenes = sceneGroupIds.map((groupIds, index) => ({
    id: matchedScenes[index]?.id ?? crypto.randomUUID(),
    groupIds,
  }));
  return next;
}
