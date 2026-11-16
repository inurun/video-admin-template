import fs from "node:fs/promises";
import path from "node:path";
import {
  LATEST_THUMBNAIL_PATH,
  LATEST_VIDEO_PATH,
  PROJECT_ROOT,
  PUBLISH_STATE_PATH,
  getProjectOutputVideoPath,
  readSavedProject,
} from "@/server/_shared/storage";
import { normalizeNiconicoMeta } from "@/server/features/project/normalize-project-meta";
import {
  cancelPublishPrepJob,
  createPublishPrepJob,
  finishPublishPrepJob,
  getActivePublishJob,
  markPublishPrepFailed,
  runPublishPrep,
  subscribePublishPrepJob,
  type PublishPrepJob,
} from "./publish-claude";
import { publishSnapshotSchema } from "./contract";

type PublishStatus = "idle" | "running" | "success" | "error";

export type PublishSnapshot = {
  status: PublishStatus;
  logs: string[];
  resultUrl: string | null;
  updatedAt: number;
  lastError: string | null;
  jobId: string | null;
};

const state: PublishSnapshot = {
  status: "idle",
  logs: [],
  resultUrl: null,
  updatedAt: Date.now(),
  lastError: null,
  jobId: null,
};

const listeners = new Set<(snapshot: PublishSnapshot) => void>();
let activeJobId: string | null = null;

async function persist() {
  await fs.mkdir(path.dirname(PUBLISH_STATE_PATH), { recursive: true });
  await fs.writeFile(PUBLISH_STATE_PATH, JSON.stringify(getPublishSnapshot(), null, 2));
}

function emit() {
  state.updatedAt = Date.now();
  const snapshot = getPublishSnapshot();
  for (const listener of listeners) {
    listener(snapshot);
  }
  void persist();
}

function getPublishSnapshot(): PublishSnapshot {
  return {
    status: state.status,
    logs: [...state.logs],
    resultUrl: state.resultUrl,
    updatedAt: state.updatedAt,
    lastError: state.lastError,
    jobId: state.jobId,
  };
}

function syncFromJob(job: PublishPrepJob) {
  if (activeJobId && job.id !== activeJobId) {
    return;
  }

  state.logs = [...job.logs];
  state.jobId = job.id;
  state.lastError = job.error ?? null;
  state.resultUrl = job.result?.url ?? state.resultUrl;

  if (job.status === "running" || job.status === "queued") {
    state.status = "running";
  } else if (job.status === "succeeded") {
    state.status = "success";
    state.resultUrl = job.result?.url ?? null;
  } else if (job.status === "failed" || job.status === "canceled") {
    state.status = "error";
    state.lastError = job.error ?? state.lastError;
  }

  emit();
}

subscribePublishPrepJob(syncFromJob);

export function subscribePublish(listener: (snapshot: PublishSnapshot) => void) {
  listeners.add(listener);
  listener(getPublishSnapshot());
  return () => {
    listeners.delete(listener);
  };
}

export async function readPublishSnapshot() {
  try {
    const content = await fs.readFile(PUBLISH_STATE_PATH, "utf8");
    return publishSnapshotSchema.parse(JSON.parse(content));
  } catch {
    return getPublishSnapshot();
  }
}

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveRenderedVideoPath(projectPath: string) {
  const candidates = [getProjectOutputVideoPath(projectPath), LATEST_VIDEO_PATH];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Rendered video not found. Checked: ${candidates.map((candidate) => path.relative(PROJECT_ROOT, candidate)).join(", ")}`,
  );
}

export async function startPublish(projectPath: string, autoSubmit: boolean) {
  if (state.status === "running" || getActivePublishJob()) {
    return {
      started: false as const,
      reason: "already_running",
    };
  }

  const project = await readSavedProject(projectPath);
  const niconico = normalizeNiconicoMeta(project.meta.niconico);
  if (!niconico.title.trim()) {
    throw new Error("meta.niconico.title is required");
  }
  if (!niconico.description.trim()) {
    throw new Error("meta.niconico.description is required");
  }

  const videoPath = await resolveRenderedVideoPath(projectPath);
  if (!(await pathExists(LATEST_THUMBNAIL_PATH))) {
    throw new Error(
      `Rendered thumbnail not found: ${path.relative(PROJECT_ROOT, LATEST_THUMBNAIL_PATH)}`,
    );
  }
  const job = createPublishPrepJob();
  activeJobId = job.id;
  state.status = "running";
  state.logs = [];
  state.resultUrl = null;
  state.lastError = null;
  state.jobId = job.id;
  syncFromJob(job);

  void runPublishPrep(
    job,
    videoPath,
    LATEST_THUMBNAIL_PATH,
    niconico,
    [...new Set([...niconico.fixedParentWorkIds, ...niconico.parentWorkIds])],
    autoSubmit,
  )
    .catch((error: unknown) => {
      markPublishPrepFailed(job, error);
    })
    .finally(() => {
      finishPublishPrepJob(job);
      syncFromJob(job);
      activeJobId = null;
    });

  return {
    started: true as const,
    jobId: job.id,
  };
}

export async function cancelPublish() {
  if (!activeJobId) {
    const active = getActivePublishJob();
    if (!active) {
      return {
        canceled: false as const,
        reason: "not_running",
      };
    }
    await cancelPublishPrepJob(active.id);
    syncFromJob(active);
    return {
      canceled: true as const,
    };
  }

  const job = await cancelPublishPrepJob(activeJobId);
  syncFromJob(job);
  return {
    canceled: true as const,
  };
}
