import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { type Options, query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { nowIso, toIso } from "@/_shared/lib/date/date";
import { PROJECT_ROOT } from "@/server/_shared/storage";
import {
  getAgentBrowserArgs,
  NICONICO_CHROME_CDP_PORT,
  runAgentBrowser,
} from "./agent-browser-cli";
import { toNiconicoDescriptionHtml } from "./niconico-description-html";
import { niconicoGarageFormFields } from "./niconico-form-defaults";
import { submitNiconicoPost } from "./niconico-submit";
import {
  normalizeLogMessage,
  type VerifiedPublishPrepResult,
  validatePublishPrepResult,
} from "./niconico-publish";

const NICONICO_VIDEO_ID_PATTERN = /^\/(?:watch\/(sm\d+)|shorts\/(ss\d+))(?:[/?#]|$)/;

function extractNiconicoVideoId(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      (parsed.hostname !== "www.nicovideo.jp" && parsed.hostname !== "nicovideo.jp")
    ) {
      return undefined;
    }
    const match = parsed.pathname.match(NICONICO_VIDEO_ID_PATTERN);
    return match?.[1] ?? match?.[2];
  } catch {
    return undefined;
  }
}

export type PublishPrepJobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export type PublishPrepJobResult = VerifiedPublishPrepResult;

export type PublishPrepJob = {
  id: string;
  status: PublishPrepJobStatus;
  logs: string[];
  logPath: string;
  result?: PublishPrepJobResult;
  error?: string;
  createdAt: number;
  updatedAt: number;
};

type PublishPrepJobRuntime = {
  controller: AbortController;
  lastLogByKey: Map<string, string>;
  sessionId?: string;
};

type VideoMeta = {
  title: string;
  description: string;
  thumbnailTime: string;
  tags: string[];
};

type ParentWork = {
  title: string;
  url: string;
};

const STORE_KEY = "__niconicoPublishPrepJobs";
const RUNTIME_STORE_KEY = "__niconicoPublishPrepJobRuntimes";
const JOB_LISTENERS_KEY = "__niconicoPublishPrepJobListeners";
const NICONICO_UPLOAD_URL = "https://garage.nicovideo.jp/niconico-garage/video/videos/upload";
const NICONICO_CHROME_READY_TIMEOUT_MS = 15_000;
const DEFAULT_HARD_TIMEOUT_MS = 1_200_000;
const DEFAULT_INACTIVITY_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_PUBLISH_LOG_FILES = 50;
const THUMBNAIL_TIME_PATTERN = /^\d{2}:[0-5]\d\.\d{3}$/;
const PUBLISH_MODEL = "claude-sonnet-5-5";
const PUBLISH_EFFORT = "low";
const AGENT_BROWSER_MCP_SERVER = "agent_browser";
const AGENT_BROWSER_TOOL_PREFIX = `mcp__${AGENT_BROWSER_MCP_SERVER}__`;
// agent-browser 0.35.1 exposes upload only through `all`; Claude may call only this allowlist.
const AGENT_BROWSER_ENABLED_TOOLS = [
  "agent_browser_open",
  "agent_browser_snapshot",
  "agent_browser_click",
  "agent_browser_fill",
  "agent_browser_type",
  "agent_browser_press",
  "agent_browser_wait_ms",
  "agent_browser_wait_for_selector",
  "agent_browser_wait_for_text",
  "agent_browser_wait_for_url",
  "agent_browser_wait_for_load",
  "agent_browser_wait_for_function",
  "agent_browser_get_text",
  "agent_browser_get_html",
  "agent_browser_get_value",
  "agent_browser_get_attr",
  "agent_browser_get_url",
  "agent_browser_get_title",
  "agent_browser_eval",
  "agent_browser_upload",
  "agent_browser_is_visible",
  "agent_browser_is_enabled",
  "agent_browser_find",
];
const DEFAULT_CHROME_EXECUTABLE_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
];

const publishResultSchema = z.object({
  outcome: z.enum(["ready", "blocked"]),
  blockingReason: z.string().nullable(),
  url: z.string(),
  title: z.string(),
  finalResponse: z.string(),
  videoPath: z.string(),
  reachedConfirmation: z.boolean(),
  finalSubmitClicked: z.boolean(),
  actualVideoTitle: z.string(),
  uploadedThumbnailPath: z.string(),
  registeredParentWorkIds: z.array(z.string()),
  registeredTags: z.array(z.string()),
});
type ClaudePublishResult = z.infer<typeof publishResultSchema>;

// Claude Code CLI の --json-schema 検証は draft 2020-12 のメタスキーマを持たない
export const PUBLISH_RESULT_SCHEMA = z.toJSONSchema(publishResultSchema, { target: "draft-07" });

function getJobStore(): Map<string, PublishPrepJob> {
  const globalStore = globalThis as typeof globalThis & {
    [STORE_KEY]?: Map<string, PublishPrepJob>;
  };
  return (globalStore[STORE_KEY] ??= new Map());
}

function getJobRuntimeStore(): Map<string, PublishPrepJobRuntime> {
  const globalStore = globalThis as typeof globalThis & {
    [RUNTIME_STORE_KEY]?: Map<string, PublishPrepJobRuntime>;
  };
  return (globalStore[RUNTIME_STORE_KEY] ??= new Map());
}

function getJobListeners(): Set<(job: PublishPrepJob) => void> {
  const globalStore = globalThis as typeof globalThis & {
    [JOB_LISTENERS_KEY]?: Set<(job: PublishPrepJob) => void>;
  };
  return (globalStore[JOB_LISTENERS_KEY] ??= new Set());
}

function emitJob(job: PublishPrepJob) {
  for (const listener of getJobListeners()) listener(job);
}

export function subscribePublishPrepJob(listener: (job: PublishPrepJob) => void) {
  getJobListeners().add(listener);
  return () => getJobListeners().delete(listener);
}

function updateJob(job: PublishPrepJob, patch: Partial<PublishPrepJob>) {
  Object.assign(job, patch, { updatedAt: Date.now() });
  emitJob(job);
}

function stringifyForLog(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ""}`;
  }
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function pushLog(
  job: PublishPrepJob,
  message: string,
  options: { dedupeKey?: string; level?: "INFO" | "WARN" | "ERROR" } = {},
) {
  const normalizedMessage = normalizeLogMessage(message);
  const runtime = getJobRuntimeStore().get(job.id);
  if (options.dedupeKey && runtime) {
    if (runtime.lastLogByKey.get(options.dedupeKey) === normalizedMessage) return;
    runtime.lastLogByKey.set(options.dedupeKey, normalizedMessage);
  }

  const level = options.level ?? "INFO";
  const line = `[${nowIso()}] [${level}] ${normalizedMessage}`;
  job.logs.push(line);
  if (job.logs.length > 500) job.logs.splice(0, job.logs.length - 500);
  job.updatedAt = Date.now();

  try {
    appendFileSync(job.logPath, `${line}\n`, "utf-8");
  } catch (error) {
    console.error(`[niconico:${job.id}] Failed to persist job log: ${stringifyForLog(error)}`);
  }

  const logLine = `[niconico:${job.id}] ${normalizedMessage}`;
  if (level === "ERROR" || /error|failed|denied|reject/i.test(message)) {
    console.error(logLine);
  } else if (level === "WARN") {
    console.warn(logLine);
  } else {
    console.log(logLine);
  }
  emitJob(job);
}

function getPublishPrepLogDir(): string {
  const configured = process.env.NICONICO_PUBLISH_LOG_DIR?.trim();
  return configured
    ? path.resolve(process.cwd(), configured)
    : path.resolve(process.cwd(), ".logs/niconico-publish");
}

function createPublishPrepLogPath(jobId: string, createdAt: number): string {
  const timestamp = toIso(createdAt).replace(/[:.]/g, "-");
  const logDir = getPublishPrepLogDir();
  mkdirSync(logDir, { recursive: true });
  return path.join(logDir, `${timestamp}_${jobId}.log`);
}

function getPositiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

async function prunePublishPrepLogs(currentLogPath: string) {
  try {
    const logDir = path.dirname(currentLogPath);
    const filenames = (await fs.readdir(logDir))
      .filter((filename) => filename.endsWith(".log"))
      .sort();
    const maxFiles = getPositiveInteger(
      "NICONICO_PUBLISH_LOG_MAX_FILES",
      DEFAULT_MAX_PUBLISH_LOG_FILES,
    );
    await Promise.all(
      filenames
        .slice(0, Math.max(0, filenames.length - maxFiles))
        .filter((filename) => path.join(logDir, filename) !== currentLogPath)
        .map((filename) => fs.unlink(path.join(logDir, filename))),
    );
  } catch (error) {
    console.error(`[niconico] Failed to prune publish logs: ${stringifyForLog(error)}`);
  }
}

function getProfileDir(): string {
  return path.resolve(PROJECT_ROOT, ".agent-browser/niconico-profile");
}

function getAgentBrowserStateDir(): string {
  return path.join(os.homedir(), ".agent-browser");
}

// Empty cwd so the agent never picks up project files such as CLAUDE.md.
export function getPublishWorkspaceDir(realHome = os.homedir()): string {
  return path.join(realHome, ".cache/niconico-publish-claude/workspace");
}

function isCdpPortListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function waitForCdpPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isCdpPortListening(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Niconico Chrome CDP port ${port} did not become ready`);
}

async function resolveAgentBrowserExecutablePath(): Promise<string | undefined> {
  if (process.env.AGENT_BROWSER_EXECUTABLE_PATH) {
    return process.env.AGENT_BROWSER_EXECUTABLE_PATH;
  }
  for (const candidate of DEFAULT_CHROME_EXECUTABLE_PATHS) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next installed Chrome channel.
    }
  }
  return undefined;
}

async function ensureNiconicoChrome() {
  if (await isCdpPortListening(NICONICO_CHROME_CDP_PORT)) return;
  const executablePath = await resolveAgentBrowserExecutablePath();
  if (!executablePath) throw new Error("Google Chrome is required for Niconico publish");

  const child = spawn(
    executablePath,
    [
      `--user-data-dir=${getProfileDir()}`,
      `--remote-debugging-port=${NICONICO_CHROME_CDP_PORT}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--noerrdialogs",
      NICONICO_UPLOAD_URL,
    ],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
  await waitForCdpPort(NICONICO_CHROME_CDP_PORT, NICONICO_CHROME_READY_TIMEOUT_MS);
}

async function attachAgentBrowserToNiconicoChrome() {
  await runAgentBrowser(["get", "url"]);
}

function assertVideoMeta(value: unknown): VideoMeta {
  if (!value || typeof value !== "object") throw new Error("videoMeta is required");
  const candidate = value as Partial<VideoMeta>;
  if (typeof candidate.title !== "string" || !candidate.title.trim()) {
    throw new Error("videoMeta.title is required");
  }
  if (typeof candidate.description !== "string" || !candidate.description.trim()) {
    throw new Error("videoMeta.description is required");
  }
  if (
    typeof candidate.thumbnailTime !== "string" ||
    !THUMBNAIL_TIME_PATTERN.test(candidate.thumbnailTime)
  ) {
    throw new Error("videoMeta.thumbnailTime must be MM:SS.mmm");
  }
  return {
    title: candidate.title,
    description: candidate.description,
    thumbnailTime: candidate.thumbnailTime,
    tags: z.array(z.string().trim().min(1)).max(6).parse(candidate.tags),
  };
}

export function parsePublishResult(value: unknown): ClaudePublishResult {
  const result = publishResultSchema.safeParse(value);
  if (!result.success) {
    throw new Error(`Claude returned an invalid publish result: ${result.error.message}`);
  }
  return result.data;
}

export function shouldRetryBlockedResult(rejectedBlockedResults: number, mcpAttempts: number) {
  return rejectedBlockedResults === 0 || mcpAttempts < 2;
}

export function createPublishAbortGuard(
  parentSignal: AbortSignal,
  hardTimeoutMs: number,
  inactivityTimeoutMs: number,
) {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parentSignal.reason);
  if (parentSignal.aborted) abortFromParent();
  else parentSignal.addEventListener("abort", abortFromParent, { once: true });
  const hardTimeout = setTimeout(
    () => controller.abort(new Error(`Claude hard timeout after ${hardTimeoutMs}ms`)),
    hardTimeoutMs,
  );
  let inactivityTimeout: ReturnType<typeof setTimeout>;
  const activity = () => {
    clearTimeout(inactivityTimeout);
    inactivityTimeout = setTimeout(
      () => controller.abort(new Error(`Claude had no activity for ${inactivityTimeoutMs}ms`)),
      inactivityTimeoutMs,
    );
  };
  activity();

  return {
    controller,
    signal: controller.signal,
    activity,
    stop() {
      clearTimeout(hardTimeout);
      clearTimeout(inactivityTimeout);
      parentSignal.removeEventListener("abort", abortFromParent);
    },
  };
}

export function createPublishQueryOptions(
  rootDir = PROJECT_ROOT,
  workspaceDir = getPublishWorkspaceDir(),
): Options {
  return {
    model: PUBLISH_MODEL,
    effort: PUBLISH_EFFORT,
    cwd: workspaceDir,
    tools: [],
    allowedTools: AGENT_BROWSER_ENABLED_TOOLS.map((tool) => `${AGENT_BROWSER_TOOL_PREFIX}${tool}`),
    permissionMode: "dontAsk",
    settingSources: [],
    strictMcpConfig: true,
    outputFormat: { type: "json_schema", schema: PUBLISH_RESULT_SCHEMA },
    mcpServers: {
      [AGENT_BROWSER_MCP_SERVER]: {
        type: "stdio",
        command: "pnpm",
        args: getAgentBrowserArgs(rootDir, ["mcp", "--tools", "all"]),
        timeout: 180_000,
        alwaysLoad: true,
      },
    },
  };
}

export type ClaudeTurnResult = {
  output: unknown;
  mcpAttempts: number;
};

function logAssistantToolUses(
  job: PublishPrepJob,
  message: Extract<SDKMessage, { type: "assistant" }>,
  toolNames: Map<string, string>,
) {
  for (const block of message.message.content) {
    if (block.type !== "tool_use" || !block.name.startsWith("mcp__")) continue;
    if (!block.name.startsWith(AGENT_BROWSER_TOOL_PREFIX)) {
      throw new Error(`Claude attempted forbidden MCP tool: ${block.name}`);
    }
    const tool = block.name.slice(AGENT_BROWSER_TOOL_PREFIX.length);
    toolNames.set(block.id, tool);
    pushLog(job, `Claude MCP ${tool}: started`, { dedupeKey: `mcp:${block.id}:started` });
  }
}

function logToolResults(
  job: PublishPrepJob,
  message: Extract<SDKMessage, { type: "user" }>,
  toolNames: Map<string, string>,
): number {
  const content = message.message.content;
  if (typeof content === "string") return 0;
  let results = 0;
  for (const block of content) {
    if (block.type !== "tool_result") continue;
    const tool = toolNames.get(block.tool_use_id);
    if (!tool) continue;
    results += 1;
    const failed = block.is_error === true;
    pushLog(
      job,
      `Claude MCP ${tool}: ${failed ? `failed (${stringifyForLog(block.content)})` : "completed"}`,
      {
        dedupeKey: `mcp:${block.tool_use_id}:result`,
        level: failed ? "WARN" : "INFO",
      },
    );
  }
  return results;
}

export async function consumeClaudeMessages(
  job: PublishPrepJob,
  messages: AsyncIterable<SDKMessage>,
  onActivity: (message: SDKMessage) => void = () => undefined,
): Promise<ClaudeTurnResult> {
  const toolNames = new Map<string, string>();
  let mcpAttempts = 0;

  for await (const message of messages) {
    onActivity(message);
    if (message.type === "system" && message.subtype === "init") {
      const runtime = getJobRuntimeStore().get(job.id);
      if (runtime) runtime.sessionId = message.session_id;
      pushLog(job, `Claude session started: ${message.session_id} model=${message.model}`);
      const server = message.mcp_servers.find((s) => s.name === AGENT_BROWSER_MCP_SERVER);
      if (server?.status !== "connected") {
        pushLog(job, `agent_browser MCP status: ${server?.status ?? "missing"}`, {
          level: "WARN",
        });
      }
      continue;
    }
    if (message.type === "system" && message.subtype === "permission_denied") {
      pushLog(job, `Claude tool denied: ${message.tool_name}`, { level: "WARN" });
      continue;
    }
    if (message.type === "assistant") {
      logAssistantToolUses(job, message, toolNames);
      continue;
    }
    if (message.type === "user") {
      mcpAttempts += logToolResults(job, message, toolNames);
      continue;
    }
    if (message.type !== "result") continue;

    if (message.subtype !== "success" || message.is_error) {
      const reason =
        message.subtype === "success"
          ? message.result
          : message.errors.join("; ") || message.subtype;
      throw new Error(`Claude turn failed: ${reason}`);
    }
    pushLog(
      job,
      `Claude turn completed: turns=${message.num_turns} inputTokens=${message.usage.input_tokens} outputTokens=${message.usage.output_tokens} costUsd=${message.total_cost_usd.toFixed(4)}`,
    );
    if (message.structured_output === undefined) {
      throw new Error("Claude completed without a structured output");
    }
    return { output: message.structured_output, mcpAttempts };
  }

  throw new Error("Claude stream ended before turn completion");
}

export function createPublishPrompt(
  procedure: string,
  videoPath: string,
  thumbnailPath: string,
  videoMeta: VideoMeta,
  parentWorks: ParentWork[],
  parentWorkIds: string[],
  tags: string[],
) {
  const descriptionHtml = toNiconicoDescriptionHtml(videoMeta.description);
  return `
${procedure}

## 実行時の設定値

- 利用できるブラウザーツールは agent_browser MCPだけ。
- シェル、ファイル編集、web search、ほかのMCPは使わない。
- 既存のヘッド付きChromeへ接続済み。新しいChromeやタブを開かず、ブラウザーを閉じない。
- MCP操作が失敗しても停止しない。snapshotで現在状態を確認し、同じ引数を盲目的に繰り返さず別のref・selector・入力方法で続行する。
- UIを変えるclickの直後は、依存するevalや入力より先にwaitまたはsnapshotを実行する。
- blockedを返せるのは、現在URLとsnapshotを確認し、複数の代替手段を試しても続行不能な場合だけ。単発のMCP失敗はblockedではない。
- ツール説明を出力・列挙しない。手順書に記載した既知のagent-browser MCPを直接使う。
- agent_browser_wait_ms の待機時間は ms で渡す。timeMs ではない。

## 作業入力

- 開始URL: ${JSON.stringify(NICONICO_UPLOAD_URL)}
- 対象mp4: ${JSON.stringify(videoPath)}
- サムネイル画像: ${JSON.stringify(thumbnailPath)}
- 動画タイトル: ${JSON.stringify(videoMeta.title)}
- 動画説明文HTML: ${JSON.stringify(descriptionHtml)}
- 確認前に登録する親作品: ${JSON.stringify(parentWorks)}
- 確認する親作品ID: ${JSON.stringify(parentWorkIds)}
- 登録するタグ（この配列で置き換える）: ${JSON.stringify(tags)}
- 固定フォーム設定: ${JSON.stringify(niconicoGarageFormFields)}

## 最終応答

手順を実行し、指定されたJSON Schemaに従って画面から実際に確認した値だけを返す。
`.trim();
}

async function runClaudePublishPrep(
  job: PublishPrepJob,
  videoPath: string,
  thumbnailPath: string,
  videoMeta: VideoMeta,
  parentWorks: ParentWork[],
): Promise<PublishPrepJobResult> {
  const runtime = getJobRuntimeStore().get(job.id);
  if (runtime?.controller.signal.aborted) throw new Error("Job was canceled");

  const procedure = await fs.readFile(
    path.resolve(PROJECT_ROOT, "src/server/features/publish/prompts/niconico-upload-procedure.md"),
    "utf-8",
  );
  await Promise.all([
    fs.mkdir(getProfileDir(), { recursive: true }),
    fs.mkdir(getAgentBrowserStateDir(), { recursive: true }),
  ]);
  await ensureNiconicoChrome();
  await attachAgentBrowserToNiconicoChrome();
  pushLog(job, `Attached to existing Chrome via CDP port ${NICONICO_CHROME_CDP_PORT}`);

  const parentWorkIds = parentWorks
    .map((work) => extractNiconicoVideoId(work.url))
    .filter((id): id is string => Boolean(id));
  if (parentWorkIds.length !== parentWorks.length) {
    throw new Error("One or more Niconico parent work URLs do not contain a valid sm/ss video ID");
  }

  const hardTimeoutMs = getPositiveInteger(
    "NICONICO_PUBLISH_HARD_TIMEOUT_MS",
    DEFAULT_HARD_TIMEOUT_MS,
  );
  const inactivityTimeoutMs = getPositiveInteger(
    "NICONICO_PUBLISH_INACTIVITY_TIMEOUT_MS",
    DEFAULT_INACTIVITY_TIMEOUT_MS,
  );
  const guard = createPublishAbortGuard(
    runtime?.controller.signal ?? new AbortController().signal,
    hardTimeoutMs,
    inactivityTimeoutMs,
  );

  try {
    pushLog(job, "Starting Claude Agent SDK publish session");
    pushLog(
      job,
      `Claude config: model=${PUBLISH_MODEL} effort=${PUBLISH_EFFORT} tools=none MCP=${AGENT_BROWSER_MCP_SERVER}`,
    );
    const workspaceDir = getPublishWorkspaceDir();
    await fs.mkdir(workspaceDir, { recursive: true, mode: 0o700 });
    const options = createPublishQueryOptions(PROJECT_ROOT, workspaceDir);
    const tags = videoMeta.tags;
    pushLog(job, `Niconico tags: ${JSON.stringify(tags)}`);
    let prompt = createPublishPrompt(
      procedure,
      videoPath,
      thumbnailPath,
      videoMeta,
      parentWorks,
      parentWorkIds,
      tags,
    );
    let rejectedBlockedResults = 0;
    for (;;) {
      const messages = query({
        prompt,
        options: {
          ...options,
          abortController: guard.controller,
          resume: getJobRuntimeStore().get(job.id)?.sessionId,
        },
      });
      const { output, mcpAttempts } = await consumeClaudeMessages(job, messages, () =>
        guard.activity(),
      );
      try {
        const result = parsePublishResult(output);
        if (result.outcome === "blocked") {
          if (!result.blockingReason?.trim()) {
            throw new Error("Blocked result requires a blocking reason");
          }
          if (shouldRetryBlockedResult(rejectedBlockedResults, mcpAttempts)) {
            rejectedBlockedResults += 1;
            const message = `Claude blocked result rejected: ${result.blockingReason}`;
            pushLog(job, `${message}; continuing recovery`, { level: "WARN" });
            prompt = `${message}\nまだ未実行の作業があり、blockedは受理しない。最新snapshotを取得し、少なくとも1つ別のMCP操作で回復を試して作業を続行する。同じ説明だけでblockedを繰り返さない。`;
            continue;
          }
          throw new Error(`Claude reported publish prep blocked: ${result.blockingReason}`);
        }
        rejectedBlockedResults = 0;
        const validationErrors = validatePublishPrepResult(result, {
          videoPath,
          videoTitle: videoMeta.title,
          thumbnailPath,
          parentWorkIds,
          tags,
        });
        if (validationErrors.length > 0) {
          throw new Error(`Publish prep verification failed: ${validationErrors.join("; ")}`);
        }
        pushLog(
          job,
          `Publish prep verified: title=${result.actualVideoTitle} thumbnail=${result.uploadedThumbnailPath} parentWorks=${result.registeredParentWorkIds.length} confirmation=${result.reachedConfirmation}`,
        );
        return {
          url: result.url,
          title: result.title,
          finalResponse: result.finalResponse,
          videoPath: result.videoPath,
          reachedConfirmation: result.reachedConfirmation,
          finalSubmitClicked: result.finalSubmitClicked,
          actualVideoTitle: result.actualVideoTitle,
          uploadedThumbnailPath: result.uploadedThumbnailPath,
          registeredParentWorkIds: result.registeredParentWorkIds,
          registeredTags: result.registeredTags,
        };
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith("Claude reported publish prep blocked:")
        ) {
          throw error;
        }
        const message = stringifyForLog(error);
        pushLog(job, `Claude result needs recovery: ${message}`, { level: "WARN" });
        prompt = `前のターンの最終結果は受理できなかった: ${message}\n現在のブラウザー状態をsnapshotで確認し、必要な作業を続行して、JSON Schemaどおりに再回答する。`;
      }
    }
  } finally {
    guard.stop();
  }
}

export type PublishVideoMeta = VideoMeta;

export function createPublishPrepJob(): PublishPrepJob {
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const job: PublishPrepJob = {
    id,
    status: "queued",
    logs: [],
    logPath: createPublishPrepLogPath(id, createdAt),
    createdAt,
    updatedAt: createdAt,
  };
  getJobStore().set(job.id, job);
  getJobRuntimeStore().set(job.id, {
    controller: new AbortController(),
    lastLogByKey: new Map(),
  });
  pushLog(job, `Job queued; persistent log: ${job.logPath}`);
  void prunePublishPrepLogs(job.logPath);
  return job;
}

export function assertPublishVideoMeta(value: unknown): VideoMeta {
  return assertVideoMeta(value);
}

export function toParentWorks(parentWorkIds: string[]): ParentWork[] {
  return parentWorkIds.map((id) => ({
    title: id,
    url: id.startsWith("ss")
      ? `https://www.nicovideo.jp/shorts/${id}`
      : `https://www.nicovideo.jp/watch/${id}`,
  }));
}

export async function runPublishPrep(
  job: PublishPrepJob,
  videoPath: string,
  thumbnailPath: string,
  videoMeta: VideoMeta,
  parentWorkIds: string[],
  autoSubmit: boolean,
): Promise<PublishPrepJobResult> {
  updateJob(job, { status: "running" });
  pushLog(job, `Starting Niconico publish prep: autoSubmit=${autoSubmit}`);
  pushLog(job, `Resolved rendered video: ${videoPath}`);
  pushLog(job, `Resolved rendered thumbnail: ${thumbnailPath}`);
  const parentWorks = toParentWorks(parentWorkIds);
  if (parentWorks.length > 0) {
    pushLog(
      job,
      `Niconico parent works: ${parentWorks.map((work) => `${work.title}: ${work.url}`).join(" | ")}`,
    );
  }

  const startedAt = Date.now();
  const result = await runClaudePublishPrep(job, videoPath, thumbnailPath, videoMeta, parentWorks);
  pushLog(job, `Niconico browser phase completed in ${Date.now() - startedAt}ms`);
  const signal = getJobRuntimeStore().get(job.id)?.controller.signal;
  if (signal?.aborted) {
    throw new Error("Job was canceled");
  }
  if (autoSubmit) {
    await submitNiconicoPost(signal ?? new AbortController().signal, (message) =>
      pushLog(job, message),
    );
  }
  updateJob(job, { status: "succeeded", result });
  pushLog(job, autoSubmit ? "Niconico post submitted" : "Niconico publish prep succeeded");
  return result;
}

export async function cancelPublishPrepJob(jobId: string): Promise<PublishPrepJob> {
  const job = getJobStore().get(jobId);
  if (!job) throw new Error("Job not found");
  if (job.status === "succeeded" || job.status === "failed" || job.status === "canceled") {
    return job;
  }

  updateJob(job, { status: "canceled", error: "Canceled by user" });
  pushLog(job, "Cancel requested by user");
  getJobRuntimeStore().get(jobId)?.controller.abort(new Error("Canceled by user"));
  return job;
}

export function finishPublishPrepJob(job: PublishPrepJob) {
  pushLog(job, `Job finished: status=${job.status} durationMs=${Date.now() - job.createdAt}`);
  getJobRuntimeStore().delete(job.id);
}

export function markPublishPrepFailed(job: PublishPrepJob, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (job.status === "canceled") {
    pushLog(job, `canceled: ${message}`);
    return;
  }
  updateJob(job, { status: "failed", error: message });
  pushLog(job, `failed: ${message}`, { level: "ERROR" });
}

export function getPublishPrepJob(jobId: string) {
  return getJobStore().get(jobId);
}

export function getActivePublishJob() {
  for (const jobId of getJobRuntimeStore().keys()) {
    const job = getJobStore().get(jobId);
    if (job) return job;
  }
  return [...getJobStore().values()].find(
    (job) => job.status === "queued" || job.status === "running",
  );
}
