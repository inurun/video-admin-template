import { savedProjectSchema, type SavedProject, type SavedTts, type G2pItem } from "@/_schemas";
import {
  readSavedProject,
  readSavedProjectDocument,
  writeSavedProject,
} from "@/server/_shared/storage";
import type { ServerEnv } from "@/server/core/env";
import { AUDIO_PADDING_SECONDS } from "@/constants";
import { enqueueProjectMutation } from "./project-mutation-queue";
import { startSynthesisBatch, type SynthesisJob } from "./tts-synthesis-jobs";
import { buildG2pContext, type G2pTarget } from "@/server/features/tts/g2p-context";
import { generateG2p } from "@/server/features/tts/llm-g2p";
import { resolveTtsSynthesisSettings } from "@/server/features/tts/synthesis-settings";
import {
  createPreviousTtsComparisonInput,
  getTtsProvider,
} from "@/server/features/tts/providers/registry";
import { readCachedWav } from "@/server/features/tts/wav-cache";

const inFlightJobs = new Map<string, Promise<void>>();
const pendingBatches = new Set<Promise<void>>();

export type AnalysisJobTarget = {
  pageId: string;
  ttsId: string;
  analysisKey: string;
};

function jobKey(projectPath: string, analysisKey: string) {
  return `${projectPath}\0${analysisKey}`;
}

export function hasInFlightAnalysisJob(projectPath: string, analysisKey: string) {
  return inFlightJobs.has(jobKey(projectPath, analysisKey));
}

function planTtsWav(
  serverEnv: ServerEnv,
  projectPath: string,
  item: SavedTts,
  g2p: G2pItem,
  presets: SavedProject["voicePresets"],
) {
  const provider = getTtsProvider(item.provider);
  const resolved = resolveTtsSynthesisSettings(item, presets);
  return provider.plan(serverEnv, {
    ...createPreviousTtsComparisonInput(resolved),
    g2p,
    projectPath,
  } as never);
}

function collectAnalyzeTargets(project: SavedProject, requested: AnalysisJobTarget[]): G2pTarget[] {
  const pagesById = new Map(
    project.pages.filter((page) => page.type !== "transition").map((page) => [page.id, page]),
  );

  return requested.flatMap((request) => {
    const page = pagesById.get(request.pageId);
    const item = page?.tts.find((tts) => tts.id === request.ttsId);
    if (
      !item ||
      item.audio.status !== "analyzing" ||
      item.audio.analysisKey !== request.analysisKey
    ) {
      return [];
    }
    return [{ pageId: request.pageId, ttsId: item.id }];
  });
}

async function applyAnalysisResults(
  serverEnv: ServerEnv,
  projectPath: string,
  requested: AnalysisJobTarget[],
  g2pByTtsId: Map<string, G2pItem>,
) {
  const project = await readSavedProject(projectPath);
  const requestedByTtsId = new Map(requested.map((target) => [target.ttsId, target]));
  const jobs: SynthesisJob[] = [];
  const affectedPageIds = new Set<string>();

  const pages: SavedProject["pages"] = [];
  for (const page of project.pages) {
    if (page.type === "transition") {
      pages.push(page);
      continue;
    }

    let changed = false;
    const tts: SavedTts[] = [];
    for (const item of page.tts) {
      const request = requestedByTtsId.get(item.id);
      const g2p = g2pByTtsId.get(item.id);
      if (
        !request ||
        !g2p ||
        request.pageId !== page.id ||
        item.audio.status !== "analyzing" ||
        item.audio.analysisKey !== request.analysisKey
      ) {
        tts.push(item);
        continue;
      }

      const planned = planTtsWav(serverEnv, projectPath, item, g2p, project.voicePresets);
      const cached = await readCachedWav(planned.wav);
      changed = true;
      affectedPageIds.add(page.id);

      if (cached) {
        tts.push({
          ...item,
          speech: { g2p },
          audio: {
            status: "ready",
            src: cached.audioSrc,
            durationSec: cached.durationSec + AUDIO_PADDING_SECONDS,
          },
        } as SavedTts);
        continue;
      }

      jobs.push({
        pageId: page.id,
        ttsId: item.id,
        wav: planned.wav,
        run: planned.run,
      });
      tts.push({
        ...item,
        speech: { g2p },
        audio: {
          status: "pending",
          src: planned.wav.audioSrc,
        },
      } as SavedTts);
    }

    pages.push(changed ? { ...page, tts } : page);
  }

  if (affectedPageIds.size === 0) {
    return;
  }

  const next = savedProjectSchema.parse({
    ...project,
    pages,
  });
  const { timeline } = await readSavedProjectDocument(projectPath);
  await writeSavedProject(projectPath, next, timeline);
  startSynthesisBatch(projectPath, jobs);
}

async function runAnalysisBatch(
  serverEnv: ServerEnv,
  projectPath: string,
  requested: AnalysisJobTarget[],
) {
  const project = await readSavedProject(projectPath);
  const targets = collectAnalyzeTargets(project, requested);
  if (targets.length === 0) {
    return;
  }

  const generated = await generateG2p(serverEnv, {
    mode: "page",
    pages: buildG2pContext(project.pages, targets),
  });
  const g2pByTtsId = new Map([...generated].map(([ttsId, result]) => [ttsId, result.g2p]));

  await enqueueProjectMutation(projectPath, () =>
    applyAnalysisResults(serverEnv, projectPath, requested, g2pByTtsId),
  );
}

export function startAnalysisBatch(
  serverEnv: ServerEnv,
  projectPath: string,
  jobs: AnalysisJobTarget[],
) {
  const pending = jobs.filter((job) => !hasInFlightAnalysisJob(projectPath, job.analysisKey));
  if (pending.length === 0) {
    return;
  }

  const keys = pending.map((job) => jobKey(projectPath, job.analysisKey));
  const task = Promise.resolve()
    .then(() => runAnalysisBatch(serverEnv, projectPath, pending))
    .catch((error: unknown) => {
      console.error("[tts-analysis]", error);
    })
    .finally(() => {
      for (const key of keys) {
        if (inFlightJobs.get(key) === task) {
          inFlightJobs.delete(key);
        }
      }
    })
    .then(() => undefined);

  for (const key of keys) {
    inFlightJobs.set(key, task);
  }

  pendingBatches.add(task);
  void task.finally(() => {
    pendingBatches.delete(task);
  });
}

export async function flushAnalysisJobsForTests() {
  await Promise.all(pendingBatches);
}

export function resetAnalysisJobsForTests() {
  inFlightJobs.clear();
  pendingBatches.clear();
}
