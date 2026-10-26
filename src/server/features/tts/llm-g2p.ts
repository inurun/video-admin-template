import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dictionaryListResponseSchema, type DictionaryEntry, type G2pItem } from "@/_schemas";
import type { ServerEnv } from "@/server/core/env";
import { listDictionary } from "@/server/features/dictionary/use-case";
import { analyzeTexts } from "@/server/features/haqumei-api/analyze";
import { HaqumeiApiError } from "@/server/features/haqumei-api/error";
import { validateG2pItems } from "@/server/features/haqumei-api/validate";
import { closerMismatchMessage } from "@/server/features/tts/g2p-closers";
import { contextForChunk, type G2pPageContext } from "@/server/features/tts/g2p-context";
import { normalizeLlmKana } from "@/server/features/tts/g2p-kana-normalize";
import { selectDictionaryHints } from "@/server/features/tts/g2p-dictionary";
import {
  addUsage,
  hasOpenRouterApiKey,
  ZERO_USAGE,
  type OpenRouterUsage,
} from "@/server/core/openrouter";
import { chunkItems, LLM_G2P_PROFILE } from "@/server/features/tts/llm-g2p-profile";
import {
  requestOpenRouterG2p,
  type OpenRouterG2pResult,
  type OpenRouterRepairItem,
} from "@/server/features/tts/openrouter";

export type G2pSource = "llm" | "analyze";

export type GeneratedG2p = {
  g2p: G2pItem;
  source: G2pSource;
};

/** page はチャンクに分けて並列に、single は1件をそのまま LLM に送る。 */
export type G2pGenerationMode = "page" | "single";

type CandidateError = { reason: string; message: string };

type Candidate = { id: string; text: string; kana: string };

type AttemptLog = {
  kind: "generate" | "repair";
  requestId?: string;
  model: string;
  provider?: string;
  finishReason?: string;
  ms: number;
  usage: OpenRouterUsage;
  kana: Record<string, string>;
  /** normalizeLlmKana で書き換えた件数。 */
  normalized: number;
  errors: Record<string, CandidateError[]>;
};

type ChunkOutcome = {
  ids: string[];
  valid: Map<string, G2pItem>;
  attempts: AttemptLog[];
  error?: string;
};

const LOG_DIR = path.join(".logs", "llm-g2p");
const ITEM_PATH = /^items\[(\d+)\]/u;

function elapsedMs(startedAt: number) {
  return Math.round(performance.now() - startedAt);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function loadDictionaryEntries(serverEnv: ServerEnv): Promise<DictionaryEntry[]> {
  try {
    return dictionaryListResponseSchema.parse(await listDictionary(serverEnv)).entries;
  } catch (error) {
    console.warn(`[llm-g2p] dictionary unavailable: ${errorMessage(error)}`);
    return [];
  }
}

function withDictionary(pages: G2pPageContext[], entries: DictionaryEntry[]): G2pPageContext[] {
  return pages.map((page) => ({
    ...page,
    utterances: page.utterances.map((utterance) => {
      if (!utterance.target) {
        return utterance;
      }
      const dictionary = selectDictionaryHints(entries, utterance.text);
      return dictionary.length > 0 ? { ...utterance, dictionary } : utterance;
    }),
  }));
}

function listTargets(pages: G2pPageContext[]) {
  const targets = new Map<string, string>();
  for (const page of pages) {
    for (const utterance of page.utterances) {
      if (utterance.target) {
        targets.set(utterance.id, utterance.text);
      }
    }
  }
  return targets;
}

async function validateCandidates(serverEnv: ServerEnv, candidates: Candidate[]) {
  const valid = new Map<string, G2pItem>();
  const errors = new Map<string, CandidateError[]>();
  const addError = (id: string, error: CandidateError) => {
    errors.set(id, [...(errors.get(id) ?? []), error]);
  };

  const submitted = candidates.filter((candidate) => {
    if (!candidate.kana) {
      addError(candidate.id, { reason: "missing_output", message: "no kana was returned" });
      return false;
    }
    const closerMessage = closerMismatchMessage(candidate.text, candidate.kana);
    if (closerMessage) {
      addError(candidate.id, { reason: "closer_mismatch", message: closerMessage });
    }
    return true;
  });

  const validate = async (items: Candidate[]) => {
    const validated = await validateG2pItems(serverEnv, items);
    items.forEach((item, index) => {
      const g2p = validated[index];
      if (g2p && !errors.has(item.id)) {
        valid.set(item.id, g2p);
      }
    });
  };

  if (submitted.length > 0) {
    try {
      await validate(submitted);
    } catch (error) {
      if (!(error instanceof HaqumeiApiError) || error.status !== 422) {
        throw error;
      }
      for (const field of error.errors) {
        const match = ITEM_PATH.exec(field.path);
        const candidate = match ? submitted[Number(match[1])] : undefined;
        if (candidate) {
          addError(candidate.id, { reason: field.reason, message: field.message ?? field.reason });
        }
      }
      const rest = submitted.filter((candidate) => !errors.has(candidate.id));
      if (rest.length > 0) {
        await validate(rest);
      }
    }
  }

  return { valid, errors };
}

function toAttemptLog(
  kind: AttemptLog["kind"],
  result: OpenRouterG2pResult,
  candidates: Candidate[],
  ms: number,
  errors: Map<string, CandidateError[]>,
): AttemptLog {
  return {
    kind,
    requestId: result.requestId,
    model: result.model,
    provider: result.provider,
    finishReason: result.finishReason,
    ms,
    usage: result.usage,
    kana: Object.fromEntries(candidates.map((candidate) => [candidate.id, candidate.kana])),
    normalized: candidates.filter(
      (candidate) => candidate.kana !== (result.kanaById.get(candidate.id) ?? ""),
    ).length,
    errors: Object.fromEntries(errors),
  };
}

async function runChunk(
  serverEnv: ServerEnv,
  pages: G2pPageContext[],
  ids: string[],
  textById: Map<string, string>,
): Promise<ChunkOutcome> {
  const valid = new Map<string, G2pItem>();
  const attempts: AttemptLog[] = [];
  const candidateOf = (id: string, result: OpenRouterG2pResult): Candidate => ({
    id,
    text: textById.get(id) ?? "",
    kana: normalizeLlmKana(result.kanaById.get(id) ?? ""),
  });

  try {
    let startedAt = performance.now();
    const first = await requestOpenRouterG2p(serverEnv, {
      kind: "generate",
      pages: contextForChunk(pages, new Set(ids)),
    });
    const firstMs = elapsedMs(startedAt);
    const firstCandidates = ids.map((id) => candidateOf(id, first));
    const firstCheck = await validateCandidates(serverEnv, firstCandidates);
    attempts.push(toAttemptLog("generate", first, firstCandidates, firstMs, firstCheck.errors));
    for (const [id, g2p] of firstCheck.valid) valid.set(id, g2p);
    if (firstCheck.errors.size === 0) {
      return { ids, valid, attempts };
    }

    const dictionaryById = new Map(
      pages.flatMap((page) =>
        page.utterances.flatMap((utterance) =>
          utterance.dictionary ? [[utterance.id, utterance.dictionary] as const] : [],
        ),
      ),
    );
    const repairItems: OpenRouterRepairItem[] = firstCandidates
      .filter((candidate) => firstCheck.errors.has(candidate.id))
      .map((candidate) => {
        const dictionary = dictionaryById.get(candidate.id);
        return {
          id: candidate.id,
          text: candidate.text,
          previousKana: candidate.kana,
          errors: firstCheck.errors.get(candidate.id) ?? [],
          ...(dictionary ? { dictionary } : {}),
        };
      });
    startedAt = performance.now();
    const repair = await requestOpenRouterG2p(serverEnv, { kind: "repair", items: repairItems });
    const repairMs = elapsedMs(startedAt);
    const repairCandidates = repairItems.map((item) => candidateOf(item.id, repair));
    const repairCheck = await validateCandidates(serverEnv, repairCandidates);
    attempts.push(toAttemptLog("repair", repair, repairCandidates, repairMs, repairCheck.errors));
    for (const [id, g2p] of repairCheck.valid) valid.set(id, g2p);
    return { ids, valid, attempts };
  } catch (error) {
    return { ids, valid, attempts, error: errorMessage(error) };
  }
}

async function runPool<T, R>(items: T[], concurrency: number, task: (item: T) => Promise<R>) {
  const results: R[] = Array.from({ length: items.length });
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function writeRunLog(mode: G2pGenerationMode, startedAt: string, value: unknown) {
  const fileName = `${startedAt.replaceAll(":", "-").replaceAll(".", "-")}-${randomUUID()}.json`;
  const absolutePath = path.join(process.cwd(), LOG_DIR, mode, fileName);
  try {
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  } catch (error) {
    console.warn(`[llm-g2p] failed to write log: ${errorMessage(error)}`);
  }
}

async function analyzeFallback(serverEnv: ServerEnv, ids: string[], textById: Map<string, string>) {
  const items = await analyzeTexts(
    serverEnv,
    ids.map((id) => textById.get(id) ?? ""),
  );
  return new Map(ids.map((id, index) => [id, items[index]!] as const));
}

/**
 * pages の target 発話から v3 の拡張かなを作る。LLM が出せなかった発話は haqumei の analyze で埋める。
 */
export async function generateG2p(
  serverEnv: ServerEnv,
  input: { mode: G2pGenerationMode; pages: G2pPageContext[] },
): Promise<Map<string, GeneratedG2p>> {
  const textById = listTargets(input.pages);
  const ids = [...textById.keys()];
  const results = new Map<string, GeneratedG2p>();
  if (ids.length === 0) {
    return results;
  }

  if (!hasOpenRouterApiKey(serverEnv)) {
    for (const [id, g2p] of await analyzeFallback(serverEnv, ids, textById)) {
      results.set(id, { g2p, source: "analyze" });
    }
    return results;
  }

  const runStartedAt = performance.now();
  const startedAt = new Date().toISOString();
  const pages = withDictionary(input.pages, await loadDictionaryEntries(serverEnv));
  const chunks = input.mode === "single" ? [ids] : chunkItems(ids, LLM_G2P_PROFILE.chunkSize);
  const outcomes = await runPool(chunks, LLM_G2P_PROFILE.concurrency, (chunk) =>
    runChunk(serverEnv, pages, chunk, textById),
  );

  for (const outcome of outcomes) {
    for (const [id, g2p] of outcome.valid) {
      results.set(id, { g2p, source: "llm" });
    }
  }
  const fallbackIds = ids.filter((id) => !results.has(id));
  let fallbackError: string | undefined;
  try {
    if (fallbackIds.length > 0) {
      for (const [id, g2p] of await analyzeFallback(serverEnv, fallbackIds, textById)) {
        results.set(id, { g2p, source: "analyze" });
      }
    }
  } catch (error) {
    fallbackError = errorMessage(error);
    throw error;
  } finally {
    await writeRunLog(input.mode, startedAt, {
      startedAt,
      mode: input.mode,
      profile: LLM_G2P_PROFILE,
      pages,
      chunks: outcomes.map(({ valid, ...outcome }) => ({
        ...outcome,
        validIds: [...valid.keys()],
      })),
      fallbackIds,
      ...(fallbackError ? { fallbackError } : {}),
      usage: outcomes
        .flatMap((outcome) => outcome.attempts)
        .reduce((total, attempt) => addUsage(total, attempt.usage), ZERO_USAGE),
      totalMs: elapsedMs(runStartedAt),
    });
  }

  return results;
}
