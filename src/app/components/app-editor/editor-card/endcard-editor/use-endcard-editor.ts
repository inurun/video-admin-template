import type { PageFormValues } from "@/app/features/page/model/page-form-schema";
import { useCallback, useState } from "react";
import { useFormContext } from "react-hook-form";
import type { EndcardAdvertiser } from "@/_schemas";
import { fetchNicoad } from "@/app/features/nicoad";
import {
  createBlankEndcardAdvertiser,
  createBlankEndcardCredit,
  createBlankEndcardMessage,
  mergeFetchedAdvertisers,
} from "@/app/features/page/lib/endcard";
import {
  useEndcardAdvertisers,
  useEndcardCredits,
  useEndcardMessages,
} from "./endcard-list/use-endcard-list";

export function useEndcardEditor() {
  const form = useFormContext<PageFormValues>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const credits = useEndcardCredits(createBlankEndcardCredit);
  const advertisers = useEndcardAdvertisers(createBlankEndcardAdvertiser);
  const messages = useEndcardMessages(createBlankEndcardMessage);

  const fetchAdvertisers = useCallback(async () => {
    const source = form.getValues(`meta.nicoadSource`);
    if (typeof source !== "string" || !source.trim()) {
      setError("Source is required");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const result = await fetchNicoad(source.trim());
      advertisers.replace(
        mergeFetchedAdvertisers(
          (form.getValues("meta.advertisers" as never) ?? []) as unknown as EndcardAdvertiser[],
          result.advertisers.map((item) => createBlankEndcardAdvertiser(item)),
        ),
      );
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to fetch nicoad");
    } finally {
      setPending(false);
    }
  }, [advertisers, form]);

  return {
    pending,
    error,
    credits,
    advertisers,
    messages,
    fetchAdvertisers,
  };
}
