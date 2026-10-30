import useSWR from "swr";
import { toast } from "sonner";
import { fetchG2pReview, g2pReviewKeys } from "../api/g2p-review-api";

export function useG2pReviewQuery(name: string) {
  const { data, mutate, isLoading } = useSWR(g2pReviewKeys.set(name), () => fetchG2pReview(name), {
    revalidateOnFocus: false,
    onError(error) {
      console.error(error);
      toast.error("Review set loading failed");
    },
  });
  return { review: data ?? { sets: [], items: [] }, isLoading, mutate };
}
