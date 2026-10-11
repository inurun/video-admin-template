import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enqueueProjectMutation,
  resetProjectMutationQueueForTests,
} from "@/server/features/project/project-mutation-queue";
import {
  cancelRender,
  readRenderSnapshot,
  resetRenderStateForTests,
  startRender,
} from "../render-state";

const readSavedProjectMock = vi.fn();
const spawnMock = vi.fn();

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

vi.mock("@/server/_shared/storage", async () => {
  const actual = await vi.importActual<typeof import("@/server/_shared/storage")>(
    "@/server/_shared/storage",
  );
  return {
    ...actual,
    readSavedProject: (...args: unknown[]) => readSavedProjectMock(...args),
    readSavedProjectDocument: async (...args: unknown[]) => ({
      project: await readSavedProjectMock(...args),
      timeline: { durationSec: 0, tracks: [{ id: "sequence", clips: [] }] },
    }),
    readSavedSchedules: async () => ({ items: [] }),
  };
});

const copyFileMock = vi.fn();
const prepareMock = vi.fn(async (input: { dir: string }) => input.dir);

vi.mock("node:fs/promises", () => ({
  default: {
    mkdir: vi.fn(),
    rm: vi.fn(),
    copyFile: (...args: unknown[]) => copyFileMock(...args),
    readdir: async () => ["frame-00-at-1.0003s.png"],
  },
}));

vi.mock("../commit-render-data", () => ({
  commitRenderData: async () => {},
}));

vi.mock("../hf-project", () => ({
  ensureHfBundle: async () => "/bundle",
  prepareHfRenderProject: (input: { dir: string }) => prepareMock(input),
}));

function createFakeChild() {
  return {
    pid: 1,
    stdout: null,
    stderr: null,
    on: vi.fn(),
    kill: vi.fn(),
  };
}

/** Emits `lines` on stdout, then closes with `code`. */
function createScriptedChild(lines: string[], code: number) {
  const child = Object.assign(new EventEmitter(), {
    pid: 1,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(),
  });
  setTimeout(() => {
    for (const line of lines) {
      child.stdout.write(`${line}\n`);
    }
    child.stdout.end();
    child.stderr.end();
    setTimeout(() => child.emit("close", code), 0);
  }, 0);
  return child;
}

const readyProject = {
  meta: { niconico: { thumbnailTime: "00:01.000" } },
  pages: [
    {
      id: "page-1",
      type: "main",
      tts: [{ audio: { status: "ready", src: "/tts/a.wav", durationSec: 1 } }],
    },
  ],
};

const pendingProject = {
  pages: [
    {
      id: "page-1",
      type: "main",
      tts: [{ audio: { status: "pending", src: "/tts/a.wav" } }],
    },
  ],
};

const analyzingProject = {
  pages: [
    {
      id: "page-1",
      type: "main",
      tts: [{ audio: { status: "analyzing", analysisKey: "key-1" } }],
    },
  ],
};

afterEach(() => {
  resetProjectMutationQueueForTests();
  resetRenderStateForTests();
  readSavedProjectMock.mockReset();
  spawnMock.mockReset();
  copyFileMock.mockReset();
  prepareMock.mockClear();
});

describe("startRender project queue", () => {
  it("waits for an in-flight save before inspecting pending tts", async () => {
    let releaseSave!: () => void;
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    const save = enqueueProjectMutation("render-queue-project", async () => {
      await saveGate;
    });

    readSavedProjectMock.mockResolvedValue(pendingProject);

    const started = startRender("render-queue-project");
    await Promise.resolve();
    expect(readSavedProjectMock).not.toHaveBeenCalled();

    releaseSave();
    await save;
    await expect(started).resolves.toEqual({
      started: false,
      reason: "tts_pending",
    });
    expect(readSavedProjectMock).toHaveBeenCalledTimes(1);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("blocks render while TTS audio is analyzing", async () => {
    readSavedProjectMock.mockResolvedValue(analyzingProject);

    await expect(startRender("analyzing-project")).resolves.toEqual({
      started: false,
      reason: "tts_pending",
    });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("blocks comments render when a reading failed", async () => {
    readSavedProjectMock.mockResolvedValue({
      pages: [
        {
          id: "comments-1",
          type: "comments",
          tts: [{ audio: { status: "failed", src: "", error: "boom" } }],
        },
      ],
    });

    await expect(startRender("comments-project")).resolves.toEqual({
      started: false,
      reason: "tts_pending",
    });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("rejects a second start from a different project while the first is starting", async () => {
    let releaseRead!: () => void;
    const readGate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    readSavedProjectMock.mockImplementation(async () => {
      await readGate;
      return readyProject;
    });
    spawnMock.mockImplementation(createFakeChild);

    const first = startRender("project-a");
    const second = startRender("project-b");
    await Promise.resolve();
    await Promise.resolve();

    expect(readSavedProjectMock).toHaveBeenCalledTimes(1);
    expect(readSavedProjectMock).toHaveBeenCalledWith("project-a");

    releaseRead();
    await expect(Promise.all([first, second])).resolves.toEqual([
      { started: true },
      { started: false, reason: "already_running" },
    ]);
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
  });
});

describe("startRender hyperframes", () => {
  it("renders, snapshots the thumbnail and reports progress", async () => {
    readSavedProjectMock.mockResolvedValue(readyProject);
    spawnMock
      .mockImplementationOnce(() =>
        createScriptedChild(["  █████░░░░░  50%  Capturing frame 15/30", "done"], 0),
      )
      .mockImplementationOnce(() => createScriptedChild([], 0));

    await expect(startRender("hf-project")).resolves.toEqual({ started: true });
    await vi.waitFor(() => expect(readRenderSnapshot().status).toBe("success"));

    const [renderCall, snapshotCall] = spawnMock.mock.calls;
    expect(renderCall?.[0]).toMatch(/node_modules\/\.bin\/hyperframes$/);
    expect(renderCall?.[1]).toEqual(
      expect.arrayContaining(["render", expect.stringMatching(/diary-hf-render$/), "-o"]),
    );
    expect(renderCall?.[1]).toContainEqual(
      expect.stringMatching(/diary-hf-render-output\/hf-project\.mp4$/),
    );
    expect(copyFileMock).toHaveBeenCalledWith(
      expect.stringMatching(/diary-hf-render-output\/hf-project\.mp4$/),
      expect.stringMatching(/out\/hf-project\.mp4$/),
    );
    expect(renderCall?.[2]).toMatchObject({
      detached: true,
      env: expect.objectContaining({
        HYPERFRAMES_NO_TELEMETRY: "1",
        HF_CAPTURE_PARALLEL_STREAM: "true",
      }),
    });
    expect(snapshotCall?.[2]).toMatchObject({
      env: expect.objectContaining({
        HYPERFRAMES_NO_TELEMETRY: "1",
        HF_CAPTURE_PARALLEL_STREAM: "true",
      }),
    });
    expect(snapshotCall?.[1]).toEqual(expect.arrayContaining(["snapshot", "--at", "1.0003"]));
    expect(copyFileMock).toHaveBeenCalledWith(
      expect.stringMatching(/diary-hf-render\/snapshots\/frame-00-at-1\.0003s\.png$/),
      expect.stringMatching(/out\/thumbnail\.png$/),
    );
    expect(readRenderSnapshot().progress).toBe(100);
  });

  it("scales hyperframes progress into the render share", async () => {
    readSavedProjectMock.mockResolvedValue(readyProject);
    spawnMock.mockImplementationOnce(() =>
      createScriptedChild(["  █████░░░░░  50%  Capturing"], 1),
    );

    await startRender("hf-progress");
    await vi.waitFor(() => expect(readRenderSnapshot().status).toBe("error"));
    expect(readRenderSnapshot().progress).toBe(45);
    expect(readRenderSnapshot().lastError).toBe("Render exited with code 1");
  });

  it("cancels while the project is being prepared", async () => {
    readSavedProjectMock.mockResolvedValue(readyProject);
    let releasePrepare!: () => void;
    prepareMock.mockImplementationOnce(
      (input) =>
        new Promise((resolve) => {
          releasePrepare = () => resolve(input.dir);
        }),
    );

    await startRender("hf-cancel");
    await vi.waitFor(() => expect(prepareMock).toHaveBeenCalled());
    expect(cancelRender()).toEqual({ canceled: true });
    releasePrepare();
    await vi.waitFor(() => expect(readRenderSnapshot().status).toBe("canceled"));
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
