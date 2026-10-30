import type { G2pReviewItem } from "@/_schemas";
import type { ServerEnv } from "@/server/core/env";
import { validateG2pItem } from "@/server/features/haqumei-api/validate";
import {
  compareKana,
  formatKanaProsody,
  isExactMatch,
  parseKanaProsody,
} from "@/server/features/tts/g2p-eval";
import type { G2pReviewCandidate, G2pReviewViewItem } from "./contract";
import { listReviewSetNames, readLatestEvalRuns, readReviewSet, writeReviewSet } from "./storage";

/** 発音が同じ kana は1つの候補にまとめ、多く出た順に並べる。 */
export function toCandidates(
  runs: readonly string[],
  item: Pick<G2pReviewItem, "kana" | "alternatives">,
): G2pReviewCandidate[] {
  const matches = (kana: string, truth: string | undefined) =>
    truth !== undefined && isExactMatch(compareKana(truth, kana));
  const statusOf = (kana: string): G2pReviewCandidate["status"] => {
    if (matches(kana, item.kana)) return "truth";
    return item.alternatives.some((truth) => matches(kana, truth)) ? "alternative" : "other";
  };

  const candidates = new Map<string, G2pReviewCandidate>();
  for (const kana of runs.filter(Boolean)) {
    const prosody = formatKanaProsody(parseKanaProsody(kana));
    const found = candidates.get(prosody);
    candidates.set(
      prosody,
      found
        ? { ...found, count: found.count + 1 }
        : { kana, prosody, count: 1, status: statusOf(kana) },
    );
  }
  return [...candidates.values()].sort((left, right) => right.count - left.count);
}

function toViewItem(item: G2pReviewItem, runs: readonly string[]): G2pReviewViewItem {
  const candidates = toCandidates(runs, item);
  return {
    ...item,
    candidates,
    mismatched: Boolean(item.kana) && candidates.some(({ status }) => status === "other"),
  };
}

export async function getG2pReview(name: string) {
  const [sets, set, runsById] = await Promise.all([
    listReviewSetNames(),
    readReviewSet(name),
    readLatestEvalRuns(name),
  ]);
  return {
    sets,
    items: set.items.map((item) => toViewItem(item, runsById.get(item.id) ?? [])),
  };
}

async function saveItem(
  name: string,
  id: string,
  update: (item: G2pReviewItem) => G2pReviewItem | Promise<G2pReviewItem>,
) {
  const set = await readReviewSet(name);
  const item = set.items.find((entry) => entry.id === id);
  if (!item) {
    throw new Error(`Review item not found: ${id}`);
  }
  const next = await update(item);
  await writeReviewSet(name, {
    items: set.items.map((entry) => (entry.id === id ? next : entry)),
  });
  return toViewItem(next, (await readLatestEvalRuns(name)).get(id) ?? []);
}

export function updateG2pReviewItem(
  serverEnv: ServerEnv,
  name: string,
  id: string,
  input: { kana: string; reviewed: boolean },
) {
  return saveItem(name, id, async (item) => {
    const { kana } = await validateG2pItem(serverEnv, { text: item.text, kana: input.kana });
    return { ...item, kana, reviewed: input.reviewed };
  });
}

export function setG2pReviewAlternative(
  name: string,
  id: string,
  input: { kana: string; accepted: boolean },
) {
  return saveItem(name, id, (item) => {
    const others = item.alternatives.filter((kana) => !isExactMatch(compareKana(kana, input.kana)));
    return { ...item, alternatives: input.accepted ? [...others, input.kana] : others };
  });
}
