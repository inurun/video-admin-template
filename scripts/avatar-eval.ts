import { parseArgs } from "node:util";
import { config } from "dotenv";
import type { SavedPage } from "@/_schemas";
import type { AvatarType } from "@/_schemas/catalog";
import { addUsage, ZERO_USAGE } from "@/server/core/openrouter";
import { readSavedProjectFile } from "@/server/_shared/storage";
import { collectPageExpressions } from "@/server/features/avatar-expression/examples";
import {
  DEFAULT_EXPRESSION,
  type ExpressionField,
} from "@/server/features/avatar-expression/expression";
import { LLM_AVATAR_PROFILE } from "@/server/features/avatar-expression/profile";
import { predictExpressions } from "@/server/features/avatar-expression/use-case";

config({ path: [".env.local", ".env"], quiet: true });

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    model: { type: "string", default: LLM_AVATAR_PROFILE.model },
    reasoning: { type: "string", default: LLM_AVATAR_PROFILE.reasoningEffort },
    per: { type: "string", default: String(LLM_AVATAR_PROFILE.examplesPerLabel) },
  },
});

if (positionals.length === 0) {
  console.error("usage: pnpm avatar:eval <projectPath…> [--model id] [--reasoning none] [--per 4]");
  process.exit(1);
}

const profile = {
  ...LLM_AVATAR_PROFILE,
  id: `eval:${values.model}:${values.reasoning}:${values.per}`,
  model: values.model,
  reasoningEffort: values.reasoning as typeof LLM_AVATAR_PROFILE.reasoningEffort,
  examplesPerLabel: Number(values.per),
};
const serverEnv = { OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY };

type Tally = { total: number; correct: number; over: number; missed: number; wrong: number };
const emptyTally = (): Tally => ({ total: 0, correct: 0, over: 0, missed: 0, wrong: 0 });
const tallies = new Map<ExpressionField, Tally>();
const confusion = new Map<string, number>();
let usage = ZERO_USAGE;

function count(avatar: AvatarType, field: ExpressionField, truth: string, predicted: string) {
  const tally = tallies.get(field) ?? emptyTally();
  tallies.set(field, tally);
  tally.total += 1;
  if (truth === predicted) {
    tally.correct += 1;
  } else if (truth === DEFAULT_EXPRESSION) {
    tally.over += 1;
  } else if (predicted === DEFAULT_EXPRESSION) {
    tally.missed += 1;
  } else {
    tally.wrong += 1;
  }
  const key = `${avatar} ${field} ${truth} → ${predicted}`;
  confusion.set(key, (confusion.get(key) ?? 0) + 1);
}

/** The page as auto would see it: no per-line overrides and no page defaults. */
function blankPage(page: Extract<SavedPage, { type: "main" }>) {
  return {
    title: page.title,
    tts: page.tts.map(({ avatar: _avatar, ...tts }) => ({
      ...tts,
      voiceName: "voiceName" in tts ? tts.voiceName : undefined,
      speakerUuid: "speakerUuid" in tts ? tts.speakerUuid : undefined,
    })),
  };
}

for (const projectPath of positionals) {
  const project = await readSavedProjectFile(projectPath);
  for (const page of project.pages) {
    if (page.type !== "main") {
      continue;
    }
    const truth = collectPageExpressions(page);
    if (truth.turns.length === 0) {
      continue;
    }
    const prediction = await predictExpressions(
      serverEnv,
      { projectPath, ...blankPage(page) },
      profile,
    );
    usage = addUsage(usage, prediction.usage);
    truth.turns.forEach((record, index) => {
      const picked = prediction.picks.turns[`t${index + 1}`];
      count(record.avatar, "eyes", record.eyes, picked?.eyes ?? DEFAULT_EXPRESSION);
      count(record.avatar, "mouth", record.mouth, picked?.mouth ?? DEFAULT_EXPRESSION);
    });
    for (const record of truth.bases) {
      count(
        record.avatar,
        "base",
        record.base,
        prediction.picks.bases[record.avatar] ?? DEFAULT_EXPRESSION,
      );
    }
    console.log(`${projectPath} ${page.id}: ${truth.turns.length} turns`);
  }
}

const percent = (value: number, total: number) =>
  `${((value / Math.max(total, 1)) * 100).toFixed(1)}%`;
console.log(`\nprofile ${profile.id}`);
for (const [field, tally] of tallies) {
  console.log(
    `${field.padEnd(5)} n=${tally.total} correct ${percent(tally.correct, tally.total)} / over ${percent(tally.over, tally.total)} / missed ${percent(tally.missed, tally.total)} / wrong option ${percent(tally.wrong, tally.total)}`,
  );
}
console.log("\nmismatches (truth → predicted)");
for (const [key, value] of [...confusion].sort((left, right) => right[1] - left[1])) {
  const [, , truth, , predicted] = key.split(" ");
  if (truth !== predicted) {
    console.log(`${String(value).padStart(4)}  ${key}`);
  }
}
console.log(
  `\ncost $${usage.costUsd.toFixed(4)} / prompt ${usage.promptTokens} (cached ${usage.cachedTokens}) / completion ${usage.completionTokens}`,
);
