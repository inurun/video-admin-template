import path from "node:path";
import { PROJECT_ROOT } from "@/server/_shared/storage";

/** Pinned `hyperframes` CLI (same version as `@hyperframes/core`). */
export const HF_BIN = path.join(PROJECT_ROOT, "node_modules", ".bin", "hyperframes");

/**
 * CLI env: telemetry (and its feedback prompt) off — the CLI's own opt-out variable.
 * Parallel streaming capture: multi-worker screenshot capture otherwise stores every frame on
 * disk first (~20 GB for a 10-minute video).
 */
export function hfEnv(): NodeJS.ProcessEnv {
  return { ...process.env, HYPERFRAMES_NO_TELEMETRY: "1", HF_CAPTURE_PARALLEL_STREAM: "true" };
}

/**
 * Matches the former Remotion output: x264 preset medium at 12 Mbps (`standard` + bitrate).
 * HF already encodes yuv420p with bt709 tags and AAC 192k.
 * One worker: auto-worker calibration misreads the near-blank first frame and lands on 1 anyway
 * (~3 s wasted), and parallel capture turns off drawElement, so more workers are not faster.
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
    "--workers",
    "1",
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
    "--describe",
    "false",
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
