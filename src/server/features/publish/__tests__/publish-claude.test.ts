import fs from "node:fs/promises";
import path from "node:path";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PROJECT_ROOT } from "@/server/_shared/storage";
import { niconicoGarageFormFields } from "../niconico-form-defaults";
import { validatePublishPrepResult } from "../niconico-publish";
import {
  consumeClaudeMessages,
  createPublishAbortGuard,
  createPublishPrompt,
  createPublishQueryOptions,
  getPublishWorkspaceDir,
  parsePublishResult,
  PUBLISH_RESULT_SCHEMA,
  shouldRetryBlockedResult,
  toParentWorks,
  type PublishPrepJob,
} from "../publish-claude";

function createJob(): PublishPrepJob {
  return {
    id: crypto.randomUUID(),
    status: "running",
    logs: [],
    logPath: `/tmp/publish-claude-${crypto.randomUUID()}.log`,
    createdAt: 0,
    updatedAt: 0,
  };
}

// Tests only build the fields the consumer reads.
async function* stream(messages: unknown[]) {
  yield* messages as SDKMessage[];
}

const init = {
  type: "system",
  subtype: "init",
  session_id: "session-1",
  model: "claude-sonnet-5-5",
  mcp_servers: [{ name: "agent_browser", status: "connected" }],
};

function toolUse(id: string, name: string) {
  return {
    type: "assistant",
    message: { content: [{ type: "tool_use", id, name, input: {} }] },
  };
}

function toolResult(id: string, isError = false) {
  return {
    type: "user",
    message: {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: id, is_error: isError, content: "click failed" },
      ],
    },
  };
}

function success(structuredOutput: unknown) {
  return {
    type: "result",
    subtype: "success",
    is_error: false,
    num_turns: 3,
    result: "",
    total_cost_usd: 0.01,
    usage: { input_tokens: 10, output_tokens: 4 },
    structured_output: structuredOutput,
  };
}

describe("publish Claude configuration", () => {
  it("embeds structured garage form defaults and does not inherit a previous video", async () => {
    const procedure = await fs.readFile(
      path.resolve(
        PROJECT_ROOT,
        "src/server/features/publish/prompts/niconico-upload-procedure.md",
      ),
      "utf-8",
    );
    expect(procedure).not.toContain("直近に投稿した動画を選んで情報を引き継ぐ");
    expect(procedure).toContain("固定フォーム設定");
    expect(procedure).toContain("は使わない");

    const prompt = createPublishPrompt(
      procedure,
      "/repo/out/latest.mp4",
      "/repo/out/thumbnail.png",
      {
        title: "title",
        description: "desc",
        thumbnailTime: "00:00.000",
        tags: ["日記"],
      },
      [],
      [],
      ["日記"],
    );
    expect(prompt).toContain(`固定フォーム設定: ${JSON.stringify(niconicoGarageFormFields)}`);
    expect(prompt).not.toContain("直近に投稿した動画を選んで情報を引き継ぐ");
  });

  it("emits a draft-07 output schema that the Claude Code CLI can validate", () => {
    expect(PUBLISH_RESULT_SCHEMA.$schema).toBe("http://json-schema.org/draft-07/schema#");
  });

  it("pins the model, effort, tool allowlist, and agent-browser MCP", () => {
    const workspaceDir = getPublishWorkspaceDir("/real-home");
    expect(workspaceDir).toBe("/real-home/.cache/niconico-publish-claude/workspace");
    const options = createPublishQueryOptions("/repo", workspaceDir);
    expect(options).toMatchObject({
      model: "claude-sonnet-5-5",
      effort: "low",
      cwd: workspaceDir,
      tools: [],
      permissionMode: "dontAsk",
      settingSources: [],
      strictMcpConfig: true,
      outputFormat: { type: "json_schema", schema: PUBLISH_RESULT_SCHEMA },
      mcpServers: {
        agent_browser: {
          type: "stdio",
          command: "pnpm",
          args: [
            "--dir",
            "/repo",
            "exec",
            "agent-browser",
            "--session",
            "niconico-publish",
            "--cdp",
            "9222",
            "mcp",
            "--tools",
            "all",
          ],
        },
      },
    });
    expect(options.allowedTools).toEqual(
      expect.arrayContaining([
        "mcp__agent_browser__agent_browser_snapshot",
        "mcp__agent_browser__agent_browser_upload",
        "mcp__agent_browser__agent_browser_eval",
      ]),
    );
    expect(options.allowedTools).not.toContain("mcp__agent_browser__agent_browser_close");
    expect(PUBLISH_RESULT_SCHEMA.additionalProperties).toBe(false);
  });
});

describe("consumeClaudeMessages", () => {
  it("logs MCP progress and returns the structured output", async () => {
    const job = createJob();
    const output = { ok: true };
    const activity = vi.fn();

    await expect(
      consumeClaudeMessages(
        job,
        stream([
          init,
          toolUse("tool-1", "mcp__agent_browser__agent_browser_snapshot"),
          toolResult("tool-1"),
          success(output),
        ]),
        activity,
      ),
    ).resolves.toEqual({ output, mcpAttempts: 1 });
    expect(activity).toHaveBeenCalledTimes(4);
    expect(job.logs.some((line) => line.includes("session-1"))).toBe(true);
    expect(job.logs.some((line) => line.includes("agent_browser_snapshot: completed"))).toBe(true);
  });

  it("keeps consuming after a failed MCP call so Claude can recover", async () => {
    const job = createJob();
    const output = { ok: true };

    await expect(
      consumeClaudeMessages(
        job,
        stream([
          toolUse("tool-1", "mcp__agent_browser__agent_browser_click"),
          toolResult("tool-1", true),
          success(output),
        ]),
      ),
    ).resolves.toEqual({ output, mcpAttempts: 1 });
    expect(job.logs.some((line) => line.includes("[WARN]") && line.includes("click failed"))).toBe(
      true,
    );
  });

  it.each([
    {
      name: "foreign MCP server",
      messages: [toolUse("tool-2", "mcp__other_server__other_tool")],
      error: "forbidden MCP tool",
    },
    {
      name: "turn failure",
      messages: [
        {
          type: "result",
          subtype: "error_during_execution",
          is_error: true,
          errors: ["model failed"],
        },
      ],
      error: "model failed",
    },
    {
      name: "missing structured output",
      messages: [success(undefined)],
      error: "without a structured output",
    },
    {
      name: "stream ending before the result",
      messages: [init],
      error: "ended before turn completion",
    },
  ])("fails closed on $name", async ({ messages, error }) => {
    await expect(consumeClaudeMessages(createJob(), stream(messages))).rejects.toThrow(error);
  });
});

describe("publish result and abort guard", () => {
  afterEach(() => vi.useRealTimers());

  it("rejects an invalid publish result", () => {
    expect(() => parsePublishResult("not json")).toThrow("invalid publish result");
    expect(() => parsePublishResult({})).toThrow("invalid publish result");
  });

  it("rejects the first blocked result and requires MCP recovery before accepting another", () => {
    expect(shouldRetryBlockedResult(0, 20)).toBe(true);
    expect(shouldRetryBlockedResult(1, 0)).toBe(true);
    expect(shouldRetryBlockedResult(1, 1)).toBe(true);
    expect(shouldRetryBlockedResult(1, 2)).toBe(false);
  });

  it("parses a structured result that passes the existing verification", () => {
    const expected = {
      videoPath: "/repo/out/project.mp4",
      videoTitle: "title",
      thumbnailPath: "/repo/out/thumbnail.png",
      parentWorkIds: ["sm1", "sm2"],
      fixedParentWorkIds: [],
      tags: [],
    };
    const result = parsePublishResult({
      outcome: "ready",
      blockingReason: null,
      url: "https://garage.nicovideo.jp/niconico-garage/video/videos/123",
      title: "投稿の確認",
      finalResponse: "ready",
      videoPath: expected.videoPath,
      reachedConfirmation: true,
      finalSubmitClicked: false,
      actualVideoTitle: expected.videoTitle,
      uploadedThumbnailPath: expected.thumbnailPath,
      registeredParentWorkIds: ["sm2", "sm1"],
      registeredTags: [],
    });

    expect(validatePublishPrepResult(result, expected)).toEqual([]);
    const taggedExpectation = { ...expected, tags: ["日記", "キャラ"] };
    expect(
      validatePublishPrepResult(
        { ...result, registeredTags: ["キャラ", "日記"] },
        taggedExpectation,
      ),
    ).toEqual([]);
    for (const registeredTags of [["日記"], ["日記", "キャラ", "余分"], ["日記", "日記"]]) {
      expect(validatePublishPrepResult({ ...result, registeredTags }, taggedExpectation)).toEqual([
        expect.stringContaining("registered tags do not match"),
      ]);
    }
    expect(() => parsePublishResult({ ...result, registeredTags: undefined })).toThrow(
      "invalid publish result",
    );
  });

  it("aborts on inactivity and parent cancellation", () => {
    vi.useFakeTimers();
    const parent = new AbortController();
    const inactivityGuard = createPublishAbortGuard(parent.signal, 1_000, 100);
    vi.advanceTimersByTime(100);
    expect(inactivityGuard.signal.aborted).toBe(true);
    expect(inactivityGuard.signal.reason).toEqual(
      expect.objectContaining({ message: expect.stringContaining("no activity") }),
    );
    inactivityGuard.stop();

    const canceledParent = new AbortController();
    const cancelGuard = createPublishAbortGuard(canceledParent.signal, 1_000, 100);
    canceledParent.abort(new Error("Canceled by user"));
    expect(cancelGuard.signal.aborted).toBe(true);
    expect(cancelGuard.signal.reason).toEqual(
      expect.objectContaining({ message: "Canceled by user" }),
    );
    cancelGuard.stop();
  });

  it("aborts on the hard timeout", () => {
    vi.useFakeTimers();
    const guard = createPublishAbortGuard(new AbortController().signal, 100, 1_000);
    vi.advanceTimersByTime(100);
    expect(guard.signal.aborted).toBe(true);
    expect(guard.signal.reason).toEqual(
      expect.objectContaining({ message: expect.stringContaining("hard timeout") }),
    );
    guard.stop();
  });
});

describe("toParentWorks", () => {
  it("builds urls for videos, shorts and seiga illustrations", () => {
    expect(toParentWorks(["sm9", "ss1", "im10778297"]).map((work) => work.url)).toEqual([
      "https://www.nicovideo.jp/watch/sm9",
      "https://www.nicovideo.jp/shorts/ss1",
      "https://seiga.nicovideo.jp/seiga/im10778297",
    ]);
  });
});
