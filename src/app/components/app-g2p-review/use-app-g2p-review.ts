import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@/_shared/lib/error-message";
import {
  requestG2pReviewAudio,
  setG2pReviewAlternative,
  updateG2pReviewItem,
} from "@/app/features/g2p-review/api/g2p-review-api";
import {
  filterReviewItems,
  initialKana,
  nextItemId,
  type G2pReviewFilter,
} from "@/app/features/g2p-review/lib/review-queue";
import { useG2pReviewQuery } from "@/app/features/g2p-review/swr/use-g2p-review-query";
import type { G2pReviewCandidate, G2pReviewViewItem } from "@/server/features/g2p-review/contract";

const DEFAULT_SET = "diary";

export function useAppG2pReview() {
  const [setName, setSetName] = useState(DEFAULT_SET);
  const [filter, setFilter] = useState<G2pReviewFilter>("unreviewed");
  const [selectedId, setSelectedId] = useState<string>();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const { review, isLoading, mutate } = useG2pReviewQuery(setName);

  const items = useMemo(() => filterReviewItems(review.items, filter), [review.items, filter]);
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const kana = selected ? (drafts[selected.id] ?? initialKana(selected)) : "";

  const setKana = useCallback(
    (value: string) => {
      if (selected) {
        setDrafts((current) => ({ ...current, [selected.id]: value }));
      }
    },
    [selected],
  );

  const play = useCallback(
    async (value: string) => {
      if (!selected || !value) {
        return;
      }
      try {
        await new Audio(await requestG2pReviewAudio(setName, selected, value)).play();
      } catch (error) {
        toast.error(getErrorMessage(error));
      }
    },
    [selected, setName],
  );

  const move = useCallback(
    (offset: number) => {
      const index = items.findIndex((item) => item.id === selected?.id);
      const target = items[index + offset];
      if (target) {
        setSelectedId(target.id);
      }
    },
    [items, selected],
  );

  const applyItem = useCallback(
    (updated: G2pReviewViewItem) =>
      mutate(
        (current) =>
          current && {
            ...current,
            items: current.items.map((item) => (item.id === updated.id ? updated : item)),
          },
        { revalidate: false },
      ),
    [mutate],
  );

  const toggleAlternative = useCallback(
    async (candidate: G2pReviewCandidate) => {
      if (!selected?.kana || candidate.status === "truth" || pending) {
        return;
      }
      setPending(true);
      try {
        await applyItem(
          await setG2pReviewAlternative(setName, selected.id, {
            kana: candidate.kana,
            accepted: candidate.status === "other",
          }),
        );
      } catch (error) {
        toast.error(getErrorMessage(error));
      } finally {
        setPending(false);
      }
    },
    [applyItem, pending, selected, setName],
  );

  const confirm = useCallback(async () => {
    if (!selected || !kana || pending) {
      return;
    }
    setPending(true);
    try {
      const updated = await updateG2pReviewItem(setName, selected.id, { kana, reviewed: true });
      setSelectedId(nextItemId(items, selected.id));
      await applyItem(updated);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setPending(false);
    }
  }, [applyItem, items, kana, pending, selected, setName]);

  const reviewedCount = review.items.filter((item) => item.reviewed).length;

  return {
    sets: review.sets,
    setName,
    setSetName,
    filter,
    setFilter,
    items,
    selected,
    selectItem: setSelectedId,
    kana,
    setKana,
    play,
    move,
    toggleAlternative,
    confirm,
    pending,
    isLoading,
    progress: `${reviewedCount}/${review.items.length}`,
  };
}
