import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { config } from "dotenv";
import { readReviewSet, writeEvalReport } from "@/server/features/g2p-review/storage";
import type { G2pEvalReport } from "@/server/features/g2p-review/contract";
import { buildSingleG2pContext } from "@/server/features/tts/g2p-context";
import {
  compareKanaToAny,
  formatKanaProsody,
  isExactMatch,
  parseKanaProsody,
} from "@/server/features/tts/g2p-eval";
import { generateG2p } from "@/server/features/tts/llm-g2p";
import { LLM_G2P_PROFILE } from "@/server/features/tts/llm-g2p-profile";
import {
  OPENROUTER_G2P_REPAIR_PROMPT,
  OPENROUTER_G2P_SYSTEM_PROMPT,
} from "@/server/features/tts/openrouter-prompt";

config({ path: [".env.local", ".env"], quiet: true });

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    runs: { type: "string", default: "1" },
    label: { type: "string", default: "eval" },
  },
});

if (positionals.length === 0) {
  console.error("usage: pnpm g2p:eval <set…> [--runs 3] [--label baseline]");
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

type EvalCase = G2pEvalReport["cases"][number];
type RunResult = EvalCase["runs"][number];

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
  const { comparison } = result;
  if (!comparison) return;
  tally.total += 1;
  if (result.source !== "llm") tally.analyze += 1;
  if (isExactMatch(comparison)) tally.exact += 1;
  if (!comparison.reading) return;
  tally.reading += 1;
  tally.boundaries += comparison.boundaries;
  tally.missingBoundaries += comparison.missingBoundaries;
  tally.extraBoundaries += comparison.extraBoundaries;
  tally.alignedPhrases += comparison.alignedPhrases;
  tally.wrongAccents += comparison.wrongAccents;
}

function describeComparison(result: RunResult) {
  const { comparison } = result;
  if (!comparison) return "unreviewed";
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
for (const setName of positionals) {
  const { items } = await readReviewSet(setName);
  const setCases = items.map(
    (item): EvalCase => ({
      setName,
      id: item.id,
      provider: item.voice.provider,
      text: item.text,
      ...(item.reviewed && item.kana ? { truth: item.kana } : {}),
      alternatives: item.alternatives,
      runs: [],
    }),
  );
  cases.push(...setCases);
  const pages = items.flatMap((item) =>
    buildSingleG2pContext({
      pageId: item.id,
      id: item.id,
      text: item.text,
      provider: item.voice.provider,
      previous: item.previous,
      next: item.next,
    }),
  );
  for (let run = 1; run <= runs; run += 1) {
    const results = await generateG2p(serverEnv, { mode: "page", pages });
    for (const evalCase of setCases) {
      const result = results.get(evalCase.id);
      const kana = result?.g2p.kana ?? "";
      evalCase.runs.push({
        kana,
        source: result?.source ?? "missing",
        ...(evalCase.truth
          ? { comparison: compareKanaToAny([evalCase.truth, ...evalCase.alternatives], kana) }
          : {}),
      });
    }
    console.log(`${setName} run ${run}/${runs}: ${items.length} utterances`);
  }
}

const show = (kana: string) => formatKanaProsody(parseKanaProsody(kana));
console.log("\nmismatches");
for (const evalCase of cases) {
  const { truth } = evalCase;
  if (!truth || evalCase.runs.every((run) => run.comparison && isExactMatch(run.comparison))) {
    continue;
  }
  console.log(`\n${evalCase.setName} ${evalCase.text}`);
  console.log(`  truth  ${show(truth)}`);
  evalCase.runs.forEach((result, index) => {
    console.log(`  run ${index + 1}  ${show(result.kana)}  (${describeComparison(result)})`);
  });
}

const tallies = new Map<string, Tally>();
for (const evalCase of cases) {
  for (const key of [evalCase.setName, `provider ${evalCase.provider}`, "all"]) {
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
const reportPath = await writeEvalReport(
  `${startedAt.replaceAll(":", "-").replaceAll(".", "-")}-${values.label}-${promptHash}.json`,
  {
    startedAt,
    label: values.label,
    promptHash,
    profileId: LLM_G2P_PROFILE.id,
    runs,
    cases,
  },
);
console.log(`\nreport ${reportPath}`);
