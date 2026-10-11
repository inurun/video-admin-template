import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PROJECT_ROOT, getProjectFileStem } from "@/server/_shared/storage";

const execFileAsync = promisify(execFile);
const DATA_PATHSPEC = "data/";

function git(args: string[]) {
  return execFileAsync("git", args, { cwd: PROJECT_ROOT });
}

/**
 * Commits data/ as the render input. Pathspec-only, so other staged changes stay out; hooks are
 * skipped because lefthook would format and re-stage unrelated staged files. Never throws.
 */
export async function commitRenderData(projectPath: string) {
  try {
    await git(["add", "--", DATA_PATHSPEC]);
    const hasChanges = await git(["diff", "--cached", "--quiet", "--", DATA_PATHSPEC]).then(
      () => false,
      () => true,
    );
    if (!hasChanges) {
      return;
    }
    await git([
      "commit",
      "--no-verify",
      "-m",
      `data: ${getProjectFileStem(projectPath)}`,
      "--",
      DATA_PATHSPEC,
    ]);
    console.info("[render]", "Committed data/.");
  } catch (error) {
    console.warn(
      "[render]",
      `Data commit skipped: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
