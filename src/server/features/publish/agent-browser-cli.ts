import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PROJECT_ROOT } from "@/server/_shared/storage";

export const AGENT_BROWSER_SESSION = "niconico-publish";
export const NICONICO_CHROME_CDP_PORT = 9222;

const execFileAsync = promisify(execFile);

export function getAgentBrowserArgs(rootDir: string, command: string[]) {
  return [
    "--dir",
    rootDir,
    "exec",
    "agent-browser",
    "--session",
    AGENT_BROWSER_SESSION,
    "--cdp",
    String(NICONICO_CHROME_CDP_PORT),
    ...command,
  ];
}

export async function runAgentBrowser(command: string[], timeoutMs = 15_000) {
  const { stdout } = await execFileAsync("pnpm", getAgentBrowserArgs(PROJECT_ROOT, command), {
    cwd: PROJECT_ROOT,
    timeout: timeoutMs,
  });
  return stdout;
}
