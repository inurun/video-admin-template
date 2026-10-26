import { resolveAvatarSettings, type AvatarType } from "@/_schemas/catalog";
import type { SavedPage, SavedSequenceItem } from "@/_schemas";
import { listSavedProjects, readSavedProjectFile } from "@/server/_shared/storage";
import {
  DEFAULT_EXPRESSION,
  expressionChoices,
  groupAvatarTurns,
  hasTurnExpressions,
  toExpressionLabels,
  TURN_FIELDS,
  type ExpressionField,
  type ExpressionLabels,
} from "./expression";

const CONTEXT_TURNS = 2;
const BASE_EXAMPLE_LINES = 3;

export type ExpressionContextTurn = { avatar: AvatarType; lines: string[] };

export type TurnRecord = {
  avatar: AvatarType;
  context: ExpressionContextTurn[];
  lines: string[];
  eyes: string;
  mouth: string;
};

export type BaseRecord = {
  avatar: AvatarType;
  title: string;
  lines: string[];
  base: string;
};

export type ExpressionHistory = {
  turns: TurnRecord[];
  bases: BaseRecord[];
};

/** Share of past turns (or pages, for base) per option, keyed avatar → field → label. */
export type ExpressionRates = Partial<
  Record<AvatarType, Partial<Record<ExpressionField, Record<string, number>>>>
>;

type MainPage = Extract<SavedPage, { type: "main" }>;

function lineText(text: string) {
  return text.replaceAll("\n", " ");
}

function mostCommon(values: readonly string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts].sort((left, right) => right[1] - left[1])[0]?.[0] ?? DEFAULT_EXPRESSION;
}

/** Turn and base records of one main page, as the examples read them. */
export function collectPageExpressions(page: MainPage): ExpressionHistory {
  const history: ExpressionHistory = { turns: [], bases: [] };
  collectPage(page, history);
  return history;
}

function collectPage(page: MainPage, history: ExpressionHistory) {
  const pageAvatars = page.meta.avatars;
  const turns = groupAvatarTurns(page.tts);
  const labelsOf = (avatar: AvatarType, item: MainPage["tts"][number]): ExpressionLabels =>
    toExpressionLabels(avatar, resolveAvatarSettings(avatar, item.avatar, pageAvatars?.[avatar]));

  turns.forEach((turn, index) => {
    if (!hasTurnExpressions(turn.avatarType)) {
      return;
    }
    // Turns rarely mix expressions (3% of same-speaker pairs); the first line stands for the turn.
    const labels = labelsOf(turn.avatarType, turn.items[0]!);
    history.turns.push({
      avatar: turn.avatarType,
      context: turns.slice(Math.max(0, index - CONTEXT_TURNS), index).map((previous) => ({
        avatar: previous.avatarType,
        lines: previous.items.map((item) => lineText(item.text)),
      })),
      lines: turn.items.map((item) => lineText(item.text)),
      eyes: labels.eyes,
      mouth: labels.mouth,
    });
  });

  const avatars = new Set(turns.map((turn) => turn.avatarType));
  for (const avatar of avatars) {
    if (expressionChoices(avatar, "base").length === 0) {
      continue;
    }
    const items = turns.filter((turn) => turn.avatarType === avatar).flatMap((turn) => turn.items);
    history.bases.push({
      avatar,
      title: page.title,
      lines: items.slice(0, BASE_EXAMPLE_LINES).map((item) => lineText(item.text)),
      base: mostCommon(items.map((item) => labelsOf(avatar, item).base)),
    });
  }
}

/** Main pages of every saved project except `excludeProjectPath`, newest project first. */
export async function loadExpressionHistory(
  excludeProjectPath?: string,
): Promise<ExpressionHistory> {
  const projects = (await listSavedProjects())
    .filter((project) => project.path !== excludeProjectPath)
    .sort((left, right) => right.path.localeCompare(left.path));
  const history: ExpressionHistory = { turns: [], bases: [] };
  for (const summary of projects) {
    let pages: SavedSequenceItem[];
    try {
      pages = (await readSavedProjectFile(summary.path)).pages;
    } catch (error) {
      console.warn(
        `[avatar-expression] skipped ${summary.path}: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    for (const page of pages) {
      if (page.type === "main") {
        collectPage(page, history);
      }
    }
  }
  return history;
}

function takePerKey<T>(records: readonly T[], keysOf: (record: T) => string[], perKey: number) {
  const picked = new Set<T>();
  const counts = new Map<string, number>();
  for (const record of records) {
    for (const key of keysOf(record)) {
      const count = counts.get(key) ?? 0;
      if (count < perKey) {
        counts.set(key, count + 1);
        picked.add(record);
      }
    }
  }
  return [...picked];
}

/** Up to `perLabel` newest examples for every avatar × field × label, default included. */
export function selectExamples(history: ExpressionHistory, perLabel: number): ExpressionHistory {
  return {
    turns: takePerKey(
      history.turns,
      (record) => TURN_FIELDS.map((field) => `${record.avatar}:${field}:${record[field]}`),
      perLabel,
    ),
    bases: takePerKey(history.bases, (record) => [`${record.avatar}:${record.base}`], perLabel),
  };
}

function rateTable(labels: readonly string[]) {
  const counts = new Map<string, number>();
  for (const label of labels) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...counts]
      .sort((left, right) => right[1] - left[1])
      .map(([label, count]) => [label, Math.round((count / labels.length) * 1000) / 1000]),
  );
}

export function expressionRates(history: ExpressionHistory): ExpressionRates {
  const rates: ExpressionRates = {};
  const avatars = new Set([
    ...history.turns.map((record) => record.avatar),
    ...history.bases.map((record) => record.avatar),
  ]);
  for (const avatar of avatars) {
    const turns = history.turns.filter((record) => record.avatar === avatar);
    const bases = history.bases.filter((record) => record.avatar === avatar);
    rates[avatar] = {
      ...(turns.length > 0
        ? {
            eyes: rateTable(turns.map((record) => record.eyes)),
            mouth: rateTable(turns.map((record) => record.mouth)),
          }
        : {}),
      ...(bases.length > 0 ? { base: rateTable(bases.map((record) => record.base)) } : {}),
    };
  }
  return rates;
}
