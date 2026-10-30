import type { G2pReviewViewItem } from "@/server/features/g2p-review/contract";

export type G2pReviewFilter = "unreviewed" | "mismatched" | "all";

const FILTERS: Record<G2pReviewFilter, (item: G2pReviewViewItem) => boolean> = {
  unreviewed: (item) => !item.reviewed,
  mismatched: (item) => item.mismatched,
  all: () => true,
};

export function filterReviewItems(items: readonly G2pReviewViewItem[], filter: G2pReviewFilter) {
  return items.filter(FILTERS[filter]);
}

/** 確定する前の kana。保存済みがなければ、いちばん多く出た候補から始める。 */
export function initialKana(item: G2pReviewViewItem) {
  return item.kana ?? item.candidates[0]?.kana ?? "";
}

/** 確定で item が一覧から消えても位置を保てるよう、次の id を先に決める。 */
export function nextItemId(items: readonly G2pReviewViewItem[], id: string | undefined) {
  const index = items.findIndex((item) => item.id === id);
  return items[index + 1]?.id ?? items[index - 1]?.id;
}
