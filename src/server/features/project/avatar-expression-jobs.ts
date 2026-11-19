import { savedProjectSchema, type SavedPage, type SavedTts } from "@/_schemas";
import {
  readSavedProject,
  readSavedProjectDocument,
  writeSavedProject,
} from "@/server/_shared/storage";
import type { ServerEnv } from "@/server/core/env";
import { hasOpenRouterApiKey } from "@/server/core/openrouter";
import { applyExpressions } from "@/server/features/avatar-expression/apply";
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

type ExpressionPick = { eyes: string; mouth: string };

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

/** Writes results only into turns still pending for the same text; anything newer wins. */
async function applyExpressionResults(
  projectPath: string,
  target: ExpressionJobTarget,
  picksByKey: ReadonlyMap<string, ExpressionPick> | null,
) {
  const project = await readSavedProject(projectPath);
  let changed = false;
  const pages = project.pages.map((page) => {
    if (page.id !== target.pageId || page.type !== "main") {
      return page;
    }
    const written = new Map<string, Pick<SavedTts, "avatar" | "avatarSource">>();
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
          written.set(item.id, { avatar: item.avatar, avatarSource: { kind: "failed", key } });
        }
        continue;
      }
      const applied = applyExpressions({
        avatars: page.meta.avatars,
        turns: [turn],
        picks: { turns: { [turn.id]: pick } },
      });
      for (const item of applied.tts) {
        written.set(item.id, { avatar: item.avatar, avatarSource: { kind: "auto", key } });
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
        const { avatar: _avatar, ...rest } = item;
        return {
          ...rest,
          ...(next.avatar ? { avatar: next.avatar } : {}),
          avatarSource: next.avatarSource,
        };
      }),
    };
  });

  if (!changed) {
    return;
  }
  const { timeline } = await readSavedProjectDocument(projectPath);
  await writeSavedProject(projectPath, savedProjectSchema.parse({ ...project, pages }), timeline);
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
  await enqueueProjectMutation(projectPath, () =>
    applyExpressionResults(projectPath, target, picksByKey),
  );
}

export function startExpressionJobs(
  serverEnv: ServerEnv,
  projectPath: string,
  targets: readonly ExpressionJobTarget[],
) {
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
    void task.finally(() => {
      pendingJobs.delete(task);
    });
  }
}

export async function flushExpressionJobsForTests() {
  await Promise.all(pendingJobs);
}

export function resetExpressionJobsForTests() {
  inFlightJobs.clear();
  pendingJobs.clear();
}
