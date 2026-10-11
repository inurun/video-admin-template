import { afterEach, describe, expect, it, vi } from "vitest";
import { commitRenderData } from "../commit-render-data";

const execFileMock = vi.fn();

vi.mock("node:child_process", () => ({
  execFile: (
    file: string,
    args: string[],
    options: unknown,
    callback: (error: Error | null, result?: { stdout: string; stderr: string }) => void,
  ) => {
    try {
      execFileMock(file, args, options);
      callback(null, { stdout: "", stderr: "" });
    } catch (error) {
      callback(error as Error);
    }
  },
}));

function gitCalls() {
  return execFileMock.mock.calls.map(([, args]) => (args as string[])[0]);
}

describe("commitRenderData", () => {
  afterEach(() => {
    execFileMock.mockReset();
  });

  it("commits only data/ when it has staged changes", async () => {
    execFileMock.mockImplementation((_file: string, args: string[]) => {
      if (args[0] === "diff") {
        throw new Error("exit 1");
      }
    });

    await commitRenderData("2026-10-10");

    expect(gitCalls()).toEqual(["add", "diff", "commit"]);
    expect(execFileMock.mock.calls[2]?.[1]).toEqual([
      "commit",
      "--no-verify",
      "-m",
      "data: 2026-10-10",
      "--",
      "data/",
    ]);
  });

  it("skips the commit when data/ is unchanged", async () => {
    await commitRenderData("2026-10-10");

    expect(gitCalls()).toEqual(["add", "diff"]);
  });

  it("swallows git failures", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    execFileMock.mockImplementation(() => {
      throw new Error("index.lock exists");
    });

    await expect(commitRenderData("2026-10-10")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
