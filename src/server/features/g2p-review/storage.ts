import fs from "node:fs/promises";
import path from "node:path";
import { g2pReviewSetSchema, type G2pReviewSet } from "@/_schemas";
import { PROJECT_ROOT } from "@/server/_shared/storage";
import { g2pEvalReportSchema, type G2pEvalReport } from "./contract";

const SETS_DIR = path.join(PROJECT_ROOT, "g2p-eval");
const REPORTS_DIR = path.join(PROJECT_ROOT, ".logs", "g2p-eval");
const SET_NAME = /^[\w-]+$/u;

function setFilePath(name: string) {
  if (!SET_NAME.test(name)) {
    throw new Error(`Invalid review set: ${name}`);
  }
  return path.join(SETS_DIR, `${name}.json`);
}

export async function listReviewSetNames() {
  const entries = await fs.readdir(SETS_DIR);
  return entries.flatMap((entry) => (entry.endsWith(".json") ? [entry.slice(0, -5)] : [])).sort();
}

export async function readReviewSet(name: string): Promise<G2pReviewSet> {
  return g2pReviewSetSchema.parse(JSON.parse(await fs.readFile(setFilePath(name), "utf8")));
}

export async function writeReviewSet(name: string, set: G2pReviewSet) {
  await fs.writeFile(setFilePath(name), `${JSON.stringify(set, null, 2)}\n`, "utf8");
}

export async function writeEvalReport(fileName: string, report: G2pEvalReport) {
  await fs.mkdir(REPORTS_DIR, { recursive: true });
  const filePath = path.join(REPORTS_DIR, fileName);
  await fs.writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return path.relative(PROJECT_ROOT, filePath);
}

/** ファイル名は日時で始まるので、名前順の末尾から見れば新しい順になる。 */
export async function readLatestEvalRuns(name: string) {
  const entries = await fs.readdir(REPORTS_DIR).catch(() => [] as string[]);
  for (const entry of entries
    .filter((file) => file.endsWith(".json"))
    .sort()
    .reverse()) {
    const parsed = g2pEvalReportSchema.safeParse(
      JSON.parse(await fs.readFile(path.join(REPORTS_DIR, entry), "utf8")),
    );
    const cases = parsed.data?.cases.filter((item) => item.setName === name) ?? [];
    if (cases.length > 0) {
      return new Map(cases.map((item) => [item.id, item.runs.map((run) => run.kana)]));
    }
  }
  return new Map<string, string[]>();
}
