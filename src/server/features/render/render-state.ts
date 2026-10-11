import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  LATEST_THUMBNAIL_PATH,
  LATEST_VIDEO_PATH,
  OUT_DIR,
  PROJECT_ROOT,
  getProjectOutputVideoPath,
  readSavedProjectDocument,
  readSavedSchedules,
} from "@/server/_shared/storage";
import { parseRenderProgress, stripAnsi } from "./parse-render-progress";
import { thumbnailTimeToFrame } from "./render-thumbnail";
import { commitRenderData } from "./commit-render-data";
import { HF_BIN, frameToSnapshotSeconds, hfEnv, hfRenderArgs, hfSnapshotArgs } from "./hf-cli";
import {
  ensureHfBundle,
  prepareHfRenderProject,
  type PrepareHfRenderProjectInput,
} from "./hf-project";
import { VIDEO_FPS } from "@/constants";
import { enqueueProjectMutation } from "@/server/features/project/project-mutation-queue";

type RenderStatus = "idle" | "running" | "success" | "error" | "canceled";

export type RenderSnapshot = {
  status: RenderStatus;
  progress: number;
  videoPath: string | null;
  updatedAt: number;
  lastError: string | null;
};

const KILL_TIMEOUT_MS = 5_000;
/**
 * Prepared HF project and in-progress MP4 of the current render (one render at a time). Under
 * the system temp dir because HF puts its work dir next to the output file (audio mix, video
 * frames), so TMPDIR can keep that off the internal disk; only the finished MP4 lands in out/.
 */
const HF_RENDER_DIR = path.join(os.tmpdir(), "diary-hf-render");
const HF_RENDER_OUTPUT_DIR = path.join(os.tmpdir(), "diary-hf-render-output");
const SNAPSHOT_FILE = /^frame-\d+-at-.*\.png$/;

const state: RenderSnapshot = {
  status: "idle",
  progress: 0,
  videoPath: null,
  updatedAt: Date.now(),
  lastError: null,
};

const listeners = new Set<(snapshot: RenderSnapshot) => void>();
let activeChild: ChildProcess | null = null;
let cancelRequested = false;
let killTimer: ReturnType<typeof setTimeout> | null = null;
let startReserved = false;

function emit() {
  state.updatedAt = Date.now();
  const snapshot = getRenderSnapshot();
  for (const listener of listeners) {
    listener(snapshot);
  }
}

function getRenderSnapshot(): RenderSnapshot {
  return {
    status: state.status,
    progress: state.progress,
    videoPath: state.videoPath,
    updatedAt: state.updatedAt,
    lastError: state.lastError,
  };
}

export function subscribeRender(listener: (snapshot: RenderSnapshot) => void) {
  listeners.add(listener);
  listener(getRenderSnapshot());

  return () => {
    listeners.delete(listener);
  };
}

export function readRenderSnapshot() {
  return getRenderSnapshot();
}

function resetRenderState() {
  state.progress = 0;
  state.videoPath = null;
  state.lastError = null;
}

function isRenderStartBlocked() {
  return startReserved || state.status === "running";
}

export function resetRenderStateForTests() {
  startReserved = false;
  cancelRequested = false;
  activeChild = null;
  clearKillTimer();
  state.status = "idle";
  state.progress = 0;
  state.videoPath = null;
  state.lastError = null;
}

function setProgress(next: number) {
  const progress = Math.min(100, Math.max(0, Math.round(next)));
  if (progress <= state.progress) {
    return;
  }

  state.progress = progress;
  emit();
}

function clearKillTimer() {
  if (!killTimer) {
    return;
  }

  clearTimeout(killTimer);
  killTimer = null;
}

function stopChild(signal: NodeJS.Signals) {
  const child = activeChild;
  if (!child?.pid) {
    return;
  }

  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

function handleOutputLine(line: string, progressScale = 1) {
  const cleaned = stripAnsi(line).replaceAll("\r", "").trim();
  if (!cleaned) {
    return;
  }

  console.info("[render]", cleaned);
  const parsed = parseRenderProgress(cleaned);
  if (parsed !== null) {
    setProgress(parsed * progressScale);
  }
}

function pipeOutput(stream: NodeJS.ReadableStream | null, onLine: (line: string) => void) {
  if (!stream) {
    return;
  }

  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += String(chunk);
    const lines = buffer.split(/\r|\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      onLine(line);
    }
  });
  stream.on("end", () => {
    if (buffer) {
      onLine(buffer);
    }
  });
}

function finishCanceledRender() {
  cancelRequested = false;
  state.status = "canceled";
  state.lastError = null;
  console.info("[render]", "Render canceled.");
  emit();
}

function finishFailedRender(message: string) {
  state.status = "error";
  state.lastError = message;
  console.info("[render]", message);
  emit();
}

async function finishSuccessfulRender(outputPath: string) {
  try {
    if (outputPath !== LATEST_VIDEO_PATH) {
      await fs.copyFile(outputPath, LATEST_VIDEO_PATH);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.info("[render]", `Failed to update latest.mp4: ${message}`);
  }
  state.status = "success";
  state.progress = 100;
  state.videoPath = "/api/render/video";
  console.info("[render]", "Render and thumbnail completed.");
  emit();
}

export async function startRender(projectPath: string) {
  return enqueueProjectMutation(projectPath, async () => {
    if (isRenderStartBlocked()) {
      return {
        started: false as const,
        reason: "already_running" as const,
      };
    }

    startReserved = true;
    try {
      const { project, timeline } = await readSavedProjectDocument(projectPath);
      const schedules = await readSavedSchedules();
      if (
        project.pages.some(
          (page) =>
            page.type !== "transition" &&
            page.tts.some((tts) => {
              if (tts.audio.status === "analyzing" || tts.audio.status === "pending") {
                return true;
              }
              if (page.type !== "comments") {
                return false;
              }
              return (
                tts.audio.status === "failed" ||
                (tts.audio.status === "ready" && tts.audio.src.trim() === "")
              );
            }),
        )
      ) {
        return {
          started: false as const,
          reason: "tts_pending" as const,
        };
      }

      await commitRenderData(projectPath);
      resetRenderState();
      cancelRequested = false;
      state.status = "running";
      emit();
      console.info("[render]", `Starting render for ${projectPath}...`);
      // Outside the project queue: building the bundle and rendering must not block saves.
      void runRender(projectPath, { project, timeline, schedules }).catch((error: unknown) => {
        activeChild = null;
        if (state.status === "running") {
          finishFailedRender(error instanceof Error ? error.message : String(error));
        }
      });

      return {
        started: true as const,
      };
    } finally {
      startReserved = false;
    }
  });
}

/** Runs the CLI as a process group (Chrome / ffmpeg children); resolves with the exit code. */
function runHf(args: string[], progressScale = 1) {
  return new Promise<number | null>((resolve, reject) => {
    const child = spawn(HF_BIN, args, {
      cwd: PROJECT_ROOT,
      detached: true,
      env: hfEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    activeChild = child;
    pipeOutput(child.stdout, (line) => handleOutputLine(line, progressScale));
    pipeOutput(child.stderr, (line) => handleOutputLine(line, progressScale));
    child.on("error", reject);
    child.on("close", (code) => {
      clearKillTimer();
      activeChild = null;
      resolve(code);
    });
  });
}

async function runRender(
  projectPath: string,
  input: Omit<PrepareHfRenderProjectInput, "dir" | "bundleDir">,
) {
  const thumbnailFrame = thumbnailTimeToFrame(input.project.meta.niconico.thumbnailTime);
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.rm(LATEST_THUMBNAIL_PATH, { force: true });
  const outputPath = getProjectOutputVideoPath(projectPath);
  const renderOutputPath = path.join(HF_RENDER_OUTPUT_DIR, path.basename(outputPath));
  await fs.rm(HF_RENDER_OUTPUT_DIR, { recursive: true, force: true });
  await fs.mkdir(HF_RENDER_OUTPUT_DIR, { recursive: true });
  const dir = await prepareHfRenderProject({
    ...input,
    dir: HF_RENDER_DIR,
    bundleDir: await ensureHfBundle(),
  });
  if (cancelRequested) {
    finishCanceledRender();
    return;
  }

  const renderCode = await runHf(hfRenderArgs(dir, renderOutputPath), 0.9);
  if (cancelRequested) {
    finishCanceledRender();
    return;
  }
  if (renderCode !== 0) {
    finishFailedRender(`Render exited with code ${renderCode ?? "unknown"}`);
    return;
  }

  setProgress(95);
  console.info("[render]", `Rendering thumbnail.png at frame ${thumbnailFrame}...`);
  const snapshotDir = path.join(dir, "snapshots");
  const seconds = frameToSnapshotSeconds(thumbnailFrame, VIDEO_FPS);
  const thumbnailCode = await runHf(hfSnapshotArgs(dir, seconds, snapshotDir));
  if (cancelRequested) {
    finishCanceledRender();
    return;
  }
  if (thumbnailCode !== 0) {
    finishFailedRender(`Thumbnail render exited with code ${thumbnailCode ?? "unknown"}`);
    return;
  }
  const snapshot = (await fs.readdir(snapshotDir)).find((file) => SNAPSHOT_FILE.test(file));
  if (!snapshot) {
    finishFailedRender("Thumbnail snapshot missing");
    return;
  }
  await fs.copyFile(path.join(snapshotDir, snapshot), LATEST_THUMBNAIL_PATH);
  // Temp may be another volume: copy, then drop the temp file.
  await fs.copyFile(renderOutputPath, outputPath);
  await fs.rm(HF_RENDER_OUTPUT_DIR, { recursive: true, force: true });
  await finishSuccessfulRender(outputPath);
}

export function cancelRender() {
  if (state.status !== "running") {
    return {
      canceled: false as const,
      reason: "not_running",
    };
  }

  // Between processes (bundle build), `runRender` stops at its next step.
  cancelRequested = true;
  stopChild("SIGTERM");
  clearKillTimer();
  killTimer = setTimeout(() => {
    stopChild("SIGKILL");
  }, KILL_TIMEOUT_MS);
  console.info("[render]", "Cancel requested.");

  return {
    canceled: true as const,
  };
}
