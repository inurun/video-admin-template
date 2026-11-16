import path from "node:path";
import { PROJECT_ROOT } from "@/server/_shared/storage";

/** Pinned `hyperframes` CLI (same version as `@hyperframes/core`). */
export const HF_BIN = path.join(PROJECT_ROOT, "node_modules", ".bin", "hyperframes");

/**
 * CLI env: telemetry (and its feedback prompt) off — the CLI's own opt-out variable.
 * Capture: one drawElement (html-in-canvas) worker. The GPU is the bottleneck, so the 3-worker
 * drawElement router (≥700 frames) is slower per frame, and screenshot workers are slower still.
 * Reached through HF's auto-worker routing rather than `--workers 1`: that route captures on the
 * already-initialized probe page, ~10% faster overall (HF 0.9.56, M4, 62 s video: 24.3 s vs 26.9 s).
 */
export function hfEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HYPERFRAMES_NO_TELEMETRY: "1",
    HF_DE_PARALLEL_ROUTER: "false",
    HF_DE_SINGLE_MIN_FRAMES: "1",
  };
}

/**
 * Matches the former Remotion output: x264 preset medium at 12 Mbps (`standard` + bitrate).
 * HF already encodes yuv420p with bt709 tags and AAC 192k.
 * No `--workers`: `hfEnv` routes capture to one drawElement worker.
 */
export function hfRenderArgs(projectDir: string, outputPath: string) {
  return [
    "render",
    projectDir,
    "-o",
    outputPath,
    "--quality",
    "standard",
    "--video-bitrate",
    "12M",
  ];
}

/** One PNG at `seconds` into `outputDir` (`frame-*.png`). */
export function hfSnapshotArgs(projectDir: string, seconds: number, outputDir: string) {
  return [
    "snapshot",
    projectDir,
    "--at",
    seconds.toFixed(4),
    "--no-end",
    "--timeout",
    "120000",
    "-o",
    outputDir,
  ];
}

/** Mid-frame time: the HF clock floors seconds × fps, so the frame start could land on frame − 1. */
export function frameToSnapshotSeconds(frame: number, fps: number) {
  return (frame + 0.01) / fps;
}
