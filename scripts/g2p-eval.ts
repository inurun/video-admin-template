import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { config } from "dotenv";
import { readSavedProjectFile } from "@/server/_shared/storage";
import { buildG2pContext, type G2pTarget } from "@/server/features/tts/g2p-context";
import {
  compareKana,
  formatKanaProsody,
  isExactMatch,
  parseKanaProsody,
  type G2pComparison,
} from "@/server/features/tts/g2p-eval";
import { generateG2p, type G2pSource } from "@/server/features/tts/llm-g2p";
import { LLM_G2P_PROFILE } from "@/server/features/tts/llm-g2p-profile";
import {
  OPENROUTER_G2P_REPAIR_PROMPT,
  OPENROUTER_G2P_SYSTEM_PROMPT,
} from "@/server/features/tts/openrouter-prompt";
import { getEffectiveReadText, getUsableG2p } from "@/server/features/tts/providers/comparison";

config({ path: [".env.local", ".env"], quiet: true });

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    runs: { type: "string", default: "1" },
    label: { type: "string", default: "eval" },
  },
});

if (positionals.length === 0) {
  console.error("usage: pnpm g2p:eval <projectPath…> [--runs 3] [--label baseline]");
  process.exit(1);
}

const runs = Math.max(1, Number(values.runs));
const serverEnv = {
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  HAQUMEI_API_URL: process.env.HAQUMEI_API_URL,
};
const promptHash = createHash("sha256")
  .update(`${OPENROUTER_G2P_SYSTEM_PROMPT}\n${OPENROUTER_G2P_REPAIR_PROMPT}`)
  .digest("hex")
  .slice(0, 8);

type RunResult = { kana: string; source: G2pSource | "missing"; comparison: G2pComparison };
type EvalCase = {
  projectPath: string;
  pageId: string;
  id: string;
  provider: string;
  text: string;
  truth: string;
  runs: RunResult[];
};

type Tally = {
  total: number;
  exact: number;
  reading: number;
  analyze: number;
  boundaries: number;
  missingBoundaries: number;
  extraBoundaries: number;
  alignedPhrases: number;
  wrongAccents: number;
};
const emptyTally = (): Tally => ({
  total: 0,
  exact: 0,
  reading: 0,
  analyze: 0,
  boundaries: 0,
  missingBoundaries: 0,
  extraBoundaries: 0,
  alignedPhrases: 0,
  wrongAccents: 0,
});

function count(tally: Tally, result: RunResult) {
  tally.total += 1;
  if (result.source !== "llm") tally.analyze += 1;
  if (isExactMatch(result.comparison)) tally.exact += 1;
  if (!result.comparison.reading) return;
  tally.reading += 1;
  tally.boundaries += result.comparison.boundaries;
  tally.missingBoundaries += result.comparison.missingBoundaries;
  tally.extraBoundaries += result.comparison.extraBoundaries;
  tally.alignedPhrases += result.comparison.alignedPhrases;
  tally.wrongAccents += result.comparison.wrongAccents;
}

function describeComparison(result: RunResult) {
  const { comparison } = result;
  const parts: string[] = [];
  if (result.source !== "llm") parts.push(result.source);
  if (!comparison.reading) {
    parts.push("reading");
  } else {
    if (comparison.missingBoundaries > 0) parts.push(`boundary -${comparison.missingBoundaries}`);
    if (comparison.extraBoundaries > 0) parts.push(`boundary +${comparison.extraBoundaries}`);
    if (comparison.wrongAccents > 0) parts.push(`accent ${comparison.wrongAccents}`);
  }
  return parts.length > 0 ? parts.join(", ") : "ok";
}

const percent = (value: number, total: number) =>
  `${((value / Math.max(total, 1)) * 100).toFixed(1)}%`;

const cases: EvalCase[] = [];
for (const projectPath of positionals) {
  const project = await readSavedProjectFile(projectPath);
  const targets: G2pTarget[] = [];
  for (const page of project.pages) {
    if (page.type === "transition") {
      continue;
    }
    for (const tts of page.tts) {
      const text = getEffectiveReadText(tts);
      const truth = getUsableG2p(tts.speech?.g2p, text);
      if (!truth) {
        continue;
      }
      targets.push({ pageId: page.id, ttsId: tts.id });
      cases.push({
        projectPath,
        pageId: page.id,
        id: tts.id,
        provider: tts.provider,
        text,
        truth: truth.kana,
        runs: [],
      });
    }
  }
  const pages = buildG2pContext(project.pages, targets);
  for (let run = 1; run <= runs; run += 1) {
    const results = await generateG2p(serverEnv, { mode: "page", pages });
    for (const evalCase of cases.filter((item) => item.projectPath === projectPath)) {
      const result = results.get(evalCase.id);
      const kana = result?.g2p.kana ?? "";
      evalCase.runs.push({
        kana,
        source: result?.source ?? "missing",
        comparison: compareKana(evalCase.truth, kana),
      });
    }
    console.log(`${projectPath} run ${run}/${runs}: ${targets.length} utterances`);
  }
}

const show = (kana: string) => formatKanaProsody(parseKanaProsody(kana));
console.log("\nmismatches");
for (const evalCase of cases) {
  if (evalCase.runs.every((result) => isExactMatch(result.comparison))) {
    continue;
  }
  console.log(`\n${evalCase.projectPath} ${evalCase.text}`);
  console.log(`  truth  ${show(evalCase.truth)}`);
  evalCase.runs.forEach((result, index) => {
    console.log(`  run ${index + 1}  ${show(result.kana)}  (${describeComparison(result)})`);
  });
}

const tallies = new Map<string, Tally>();
for (const evalCase of cases) {
  for (const key of [evalCase.projectPath, `provider ${evalCase.provider}`, "all"]) {
    const tally = tallies.get(key) ?? emptyTally();
    tallies.set(key, tally);
    for (const result of evalCase.runs) count(tally, result);
  }
}

console.log(`\nprofile ${LLM_G2P_PROFILE.id} / prompt ${promptHash} / runs ${runs}`);
for (const [key, tally] of tallies) {
  console.log(
    `${key}: n=${tally.total} exact ${percent(tally.exact, tally.total)} / reading ${percent(tally.reading, tally.total)} / boundary missed ${percent(tally.missingBoundaries, tally.boundaries)} extra ${tally.extraBoundaries} / accent wrong ${percent(tally.wrongAccents, tally.alignedPhrases)} / analyze ${tally.analyze}`,
  );
}

const startedAt = new Date().toISOString();
const reportPath = path.join(
  ".logs",
  "g2p-eval",
  `${startedAt.replaceAll(":", "-").replaceAll(".", "-")}-${values.label}-${promptHash}.json`,
);
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(
  reportPath,
  `${JSON.stringify(
    {
      startedAt,
      label: values.label,
      promptHash,
      profile: LLM_G2P_PROFILE,
      runs,
      tallies: Object.fromEntries(tallies),
      cases,
    },
    null,
    2,
  )}\n`,
  "utf8",
);
console.log(`\nreport ${reportPath}`);
