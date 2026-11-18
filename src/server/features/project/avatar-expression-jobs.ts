import { savedProjectSchema, type SavedPage, type SavedTts } from "@/_schemas";
import { createTtsAnalysisKey } from "@/server/features/tts/analysis-key";
import { getEffectiveReadText, getUsableG2p } from "@/server/features/tts/providers/comparison";
import { getSpeechPipeline } from "@/server/features/tts/speech-pipeline";
import {
  readSavedProject,
  readSavedProjectDocument,
  writeSavedProject,
} from "@/server/_shared/storage";
import type { ServerEnv } from "@/server/core/env";
import { hasOpenRouterApiKey } from "@/server/core/openrouter";
import { applyExpressions, type ExpressionPicks } from "@/server/features/avatar-expression/apply";
import { planPageExpressions } from "@/server/features/avatar-expression/auto-plan";
import {
  DEFAULT_EXPRESSION,
  expressionTurnKey,
} from "@/server/features/avatar-expression/expression";
import {
  buildExpressionTurns,
  predictExpressions,
} from "@/server/features/avatar-expression/use-case";
import { enqueueProjectMutation } from "./project-mutation-queue";
import { startAnalysisBatch, type AnalysisJobTarget } from "./tts-analysis-jobs";

type ExpressionPick = NonNullable<ExpressionPicks["turns"][string]>;

export type ExpressionJobTarget = { pageId: string; keys: string[] };

const inFlightJobs = new Map<string, Promise<void>>();
const pendingJobs = new Set<Promise<void>>();

function jobKey(projectPath: string, pageId: string, key: string) {
  return `${projectPath}\0${pageId}\0${key}`;
}

/** Marks the turns of a main page whose text changed as pending; other pages pass through. */
export function planSavedPageExpressions(
  serverEnv: ServerEnv,
  projectPath: string,
  page: SavedPage,
  previousTtsById: ReadonlyMap<string, SavedTts>,
): { page: SavedPage; target?: ExpressionJobTarget } {
  if (page.type !== "main") {
    return { page };
  }
  const planned = planPageExpressions(page.tts, previousTtsById, {
    enabled: hasOpenRouterApiKey(serverEnv),
    isInFlight: (key) => inFlightJobs.has(jobKey(projectPath, page.id, key)),
  });
  return {
    page: { ...page, tts: planned.tts },
    target: planned.keys.length > 0 ? { pageId: page.id, keys: planned.keys } : undefined,
  };
}

async function predictPicksByKey(serverEnv: ServerEnv, projectPath: string, pageId: string) {
  const project = await readSavedProject(projectPath);
  const page = project.pages.find((item) => item.id === pageId);
  if (page?.type !== "main") {
    return new Map<string, ExpressionPick>();
  }
  const prediction = await predictExpressions(serverEnv, {
    projectPath,
    title: page.title,
    avatars: page.meta.avatars,
    tts: page.tts,
  });
  return new Map(
    prediction.turns.map((turn) => [
      expressionTurnKey(
        turn.avatarType,
        turn.items.map((item) => item.text),
      ),
      prediction.picks.turns[turn.id] ?? { eyes: DEFAULT_EXPRESSION, mouth: DEFAULT_EXPRESSION },
    ]),
  );
}

type WrittenExpression = Pick<SavedTts, "avatar" | "avatarSource" | "voiceEmotion">;

/**
 * A line whose made audio was read with another voice emotion goes back to analyzing, so its
 * prosody reference is read again. Lines still analyzing pick the emotion up themselves (their
 * analysis waits for the expression job).
 */
function reanalyzeForEmotion(
  projectPath: string,
  pageId: string,
  item: SavedTts,
): { item: SavedTts; target?: AnalysisJobTarget } {
  if (
    getSpeechPipeline(item.provider).pipeline !== "prosody" ||
    (item.audio.status !== "ready" && item.audio.status !== "pending")
  ) {
    return { item };
  }
  const readText = getEffectiveReadText(item);
  const g2p = getUsableG2p(item.speech.g2p, readText);
  if (!g2p) {
    return { item };
  }
  const analysisKey = createTtsAnalysisKey({
    projectPath,
    pageId,
    ttsId: item.id,
    provider: item.provider,
    text: item.text,
    effectiveReadText: readText,
    kana: g2p.kana,
    ...(item.voiceEmotion ? { voiceEmotion: item.voiceEmotion } : {}),
  });
  return {
    item: { ...item, audio: { status: "analyzing", analysisKey } } as SavedTts,
    target: { pageId, ttsId: item.id, analysisKey },
  };
}

/**
 * Writes results only into turns still pending for the same text; anything newer wins. Returns
 * the lines to analyze again because their voice emotion changed.
 */
async function applyExpressionResults(
  projectPath: string,
  target: ExpressionJobTarget,
  picksByKey: ReadonlyMap<string, ExpressionPick> | null,
): Promise<AnalysisJobTarget[]> {
  const project = await readSavedProject(projectPath);
  const analysisTargets: AnalysisJobTarget[] = [];
  let changed = false;
  const pages = project.pages.map((page) => {
    if (page.id !== target.pageId || page.type !== "main") {
      return page;
    }
    const written = new Map<string, WrittenExpression>();
    for (const turn of buildExpressionTurns(page.tts)) {
      const key = expressionTurnKey(
        turn.avatarType,
        turn.items.map((item) => item.text),
      );
      const pending = turn.items.every(
        (item) => item.avatarSource?.kind === "pending" && item.avatarSource.key === key,
      );
      if (!target.keys.includes(key) || !pending) {
        continue;
      }
      const pick = picksByKey?.get(key);
      if (!pick) {
        for (const item of turn.items) {
          written.set(item.id, {
            avatar: item.avatar,
            voiceEmotion: item.voiceEmotion,
            avatarSource: { kind: "failed", key },
          });
        }
        continue;
      }
      const applied = applyExpressions({
        avatars: page.meta.avatars,
        turns: [turn],
        picks: { turns: { [turn.id]: pick } },
      });
      for (const item of applied.tts) {
        written.set(item.id, {
          avatar: item.avatar,
          voiceEmotion: item.voiceEmotion,
          avatarSource: { kind: "auto", key },
        });
      }
    }
    if (written.size === 0) {
      return page;
    }
    changed = true;
    return {
      ...page,
      tts: page.tts.map((item) => {
        const next = written.get(item.id);
        if (!next) {
          return item;
        }
        const { avatar: _avatar, voiceEmotion: _voiceEmotion, ...rest } = item;
        const updated = {
          ...rest,
          ...(next.avatar ? { avatar: next.avatar } : {}),
          ...(next.voiceEmotion ? { voiceEmotion: next.voiceEmotion } : {}),
          avatarSource: next.avatarSource,
        } as SavedTts;
        if (updated.voiceEmotion === item.voiceEmotion) {
          return updated;
        }
        const reanalyzed = reanalyzeForEmotion(projectPath, page.id, updated);
        if (reanalyzed.target) {
          analysisTargets.push(reanalyzed.target);
        }
        return reanalyzed.item;
      }),
    };
  });

  if (!changed) {
    return [];
  }
  const { timeline } = await readSavedProjectDocument(projectPath);
  await writeSavedProject(projectPath, savedProjectSchema.parse({ ...project, pages }), timeline);
  return analysisTargets;
}

async function runExpressionJob(
  serverEnv: ServerEnv,
  projectPath: string,
  target: ExpressionJobTarget,
) {
  let picksByKey: Map<string, ExpressionPick> | null;
  try {
    picksByKey = await predictPicksByKey(serverEnv, projectPath, target.pageId);
  } catch (error) {
    console.error("[avatar-expression]", error);
    picksByKey = null;
  }
  const analysisTargets = await enqueueProjectMutation(projectPath, () =>
    applyExpressionResults(projectPath, target, picksByKey),
  );
  startAnalysisBatch(serverEnv, projectPath, analysisTargets);
}

/** Resolves when every started job has written its results (failures included). */
export function startExpressionJobs(
  serverEnv: ServerEnv,
  projectPath: string,
  targets: readonly ExpressionJobTarget[],
): Promise<void> {
  const tasks: Promise<void>[] = [];
  for (const target of targets) {
    const keys = target.keys.map((key) => jobKey(projectPath, target.pageId, key));
    const task = Promise.resolve()
      .then(() => runExpressionJob(serverEnv, projectPath, target))
      .catch((error: unknown) => {
        console.error("[avatar-expression]", error);
      })
      .finally(() => {
        for (const key of keys) {
          if (inFlightJobs.get(key) === task) {
            inFlightJobs.delete(key);
          }
        }
      });
    for (const key of keys) {
      inFlightJobs.set(key, task);
    }
    pendingJobs.add(task);
    tasks.push(task);
    void task.finally(() => {
      pendingJobs.delete(task);
    });
  }
  return Promise.all(tasks).then(() => undefined);
}

export async function flushExpressionJobsForTests() {
  await Promise.all(pendingJobs);
}

export function resetExpressionJobsForTests() {
  inFlightJobs.clear();
  pendingJobs.clear();
}
