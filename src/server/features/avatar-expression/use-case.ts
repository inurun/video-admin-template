import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AvatarOverride } from "@/_schemas";
import { resolveAvatarSettings, type AvatarType } from "@/_schemas/catalog";
import type { ServerEnv } from "@/server/core/env";
import { requestOpenRouterJson, ZERO_USAGE, type OpenRouterUsage } from "@/server/core/openrouter";
import {
  applyExpressions,
  type ExpressionPicks,
  type ExpressionTurn,
  type PageAvatars,
} from "./apply";
import type { AvatarExpressionGenerateRequest, AvatarExpressionGenerateResponse } from "./contract";
import { expressionRates, loadExpressionHistory, selectExamples } from "./examples";
import {
  DEFAULT_EXPRESSION,
  expressionChoices,
  expressionTurnKey,
  groupAvatarTurns,
  hasTurnExpressions,
  toExpressionLabels,
  type ExpressionField,
  type ExpressionLabels,
  type VoiceLike,
} from "./expression";
import { LLM_AVATAR_PROFILE, type AvatarExpressionProfile } from "./profile";
import {
  buildOutputJsonSchema,
  buildSystemPrompt,
  buildUserContent,
  expressionOutputSchema,
  type ExpressionOutput,
} from "./prompt";

const LOG_DIR = path.join(".logs", "llm-avatar");

export type ExpressionPageInput = {
  /** Its own project is left out of the examples. */
  projectPath: string;
  title: string;
  avatars?: PageAvatars;
  tts: (VoiceLike & { id: string; text: string; avatar?: AvatarOverride })[];
};

type ExpressionTts = ExpressionPageInput["tts"][number];

export type ExpressionPrediction = {
  turns: ExpressionTurn<ExpressionTts>[];
  picks: Required<ExpressionPicks>;
  usage: OpenRouterUsage;
};

type Discarded = { at: string; field: ExpressionField; label: string };

/** Turns of avatars that have eyes / mouth options, ids in playback order. */
export function buildExpressionTurns<T extends ExpressionTts>(
  tts: readonly T[],
): ExpressionTurn<T>[] {
  return groupAvatarTurns(tts)
    .filter((turn) => hasTurnExpressions(turn.avatarType))
    .map((turn, index) => ({ id: `t${index + 1}`, ...turn }));
}

function validLabel(avatarType: AvatarType, field: ExpressionField, label: string) {
  return label === DEFAULT_EXPRESSION || expressionChoices(avatarType, field).includes(label);
}

function readPicks(turns: readonly ExpressionTurn[], output: ExpressionOutput) {
  const discarded: Discarded[] = [];
  const keep = (at: string, avatarType: AvatarType, field: ExpressionField, label: string) => {
    if (validLabel(avatarType, field, label)) {
      return label;
    }
    discarded.push({ at, field, label });
    return DEFAULT_EXPRESSION;
  };

  const turnById = new Map(turns.map((turn) => [turn.id, turn]));
  const picks: Required<ExpressionPicks> = { bases: {}, turns: {} };
  for (const entry of output.turns) {
    const turn = turnById.get(entry.id);
    if (turn) {
      picks.turns[entry.id] = {
        eyes: keep(entry.id, turn.avatarType, "eyes", entry.eyes),
        mouth: keep(entry.id, turn.avatarType, "mouth", entry.mouth),
      };
    }
  }
  const avatarTypes = new Set(turns.map((turn) => turn.avatarType));
  for (const entry of output.bases) {
    const avatarType = entry.avatar as AvatarType;
    if (avatarTypes.has(avatarType)) {
      picks.bases[avatarType] = keep(entry.avatar, avatarType, "base", entry.base);
    }
  }
  return { picks, discarded };
}

async function writeRunLog(startedAt: string, value: unknown) {
  const fileName = `${startedAt.replaceAll(":", "-").replaceAll(".", "-")}-${randomUUID()}.json`;
  const absolutePath = path.join(process.cwd(), LOG_DIR, fileName);
  try {
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  } catch (error) {
    console.warn(
      `[avatar-expression] failed to write log: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Asks the LLM for one expression per turn and a base per character. */
export async function predictExpressions(
  serverEnv: ServerEnv,
  input: ExpressionPageInput,
  profile: AvatarExpressionProfile = LLM_AVATAR_PROFILE,
): Promise<ExpressionPrediction> {
  const turns = buildExpressionTurns(input.tts);
  if (turns.length === 0) {
    return { turns, picks: { bases: {}, turns: {} }, usage: ZERO_USAGE };
  }

  const startedAt = new Date().toISOString();
  const started = performance.now();
  const history = await loadExpressionHistory(input.projectPath);
  const avatarTypes = [...new Set(turns.map((turn) => turn.avatarType))];
  const defaults: Partial<Record<AvatarType, ExpressionLabels>> = Object.fromEntries(
    avatarTypes.map((avatarType) => [
      avatarType,
      toExpressionLabels(
        avatarType,
        resolveAvatarSettings(avatarType, input.avatars?.[avatarType]),
      ),
    ]),
  );
  const promptTurns = turns.map((turn) => ({
    id: turn.id,
    avatar: turn.avatarType,
    lines: turn.items.map((item) => item.text.replaceAll("\n", " ")),
  }));

  const result = await requestOpenRouterJson(serverEnv, {
    profile,
    system: buildSystemPrompt(
      selectExamples(history, profile.examplesPerLabel),
      expressionRates(history),
    ),
    user: buildUserContent({ title: input.title, defaults, turns: promptTurns }),
    schemaName: "avatar_expressions",
    jsonSchema: buildOutputJsonSchema(
      avatarTypes,
      turns.map((turn) => turn.id),
    ),
    output: expressionOutputSchema,
  });
  const { picks, discarded } = readPicks(turns, result.output);

  await writeRunLog(startedAt, {
    profile: profile.id,
    projectPath: input.projectPath,
    requestId: result.requestId,
    model: result.model,
    provider: result.provider,
    finishReason: result.finishReason,
    ms: Math.round(performance.now() - started),
    usage: result.usage,
    turns: promptTurns,
    output: result.output,
    discarded,
  });

  return { turns, picks, usage: result.usage };
}

export async function generateAvatarExpressions(
  serverEnv: ServerEnv,
  request: AvatarExpressionGenerateRequest,
): Promise<AvatarExpressionGenerateResponse> {
  const prediction = await predictExpressions(serverEnv, {
    projectPath: request.projectPath,
    ...request.page,
  });
  const applied = applyExpressions({
    avatars: request.page.avatars,
    turns: prediction.turns,
    picks: prediction.picks,
  });
  const keyByTtsId = new Map(
    prediction.turns.flatMap((turn) => {
      const key = expressionTurnKey(
        turn.avatarType,
        turn.items.map((item) => item.text),
      );
      return turn.items.map((item) => [item.id, key] as const);
    }),
  );
  return {
    avatars: applied.avatars,
    tts: applied.tts.map((item) => ({
      id: item.id,
      avatar: item.avatar ?? null,
      avatarSource: { kind: "auto" as const, key: keyByTtsId.get(item.id)! },
    })),
  };
}
