import type { EndcardAdvertiser, EndcardCredit, EndcardMessage } from "@/_schemas";

export function createBlankEndcardCredit(partial?: Partial<EndcardCredit>): EndcardCredit {
  return {
    id: crypto.randomUUID(),
    title: "",
    url: "",
    ...partial,
  };
}

export function createBlankEndcardAdvertiser(
  partial?: Partial<EndcardAdvertiser>,
): EndcardAdvertiser {
  return {
    id: crypto.randomUUID(),
    identityKey: `manual:${crypto.randomUUID()}`,
    introductionCount: 0,
    name: "",
    message: "",
    ...partial,
  };
}

/**
 * Niconico ad messages never change once sent, so a local message that still starts with the
 * fetched one is the fetched message plus a local addition and survives a refetch.
 */
export function mergeFetchedAdvertisers(
  current: readonly EndcardAdvertiser[],
  fetched: readonly EndcardAdvertiser[],
): EndcardAdvertiser[] {
  const byKey = new Map(current.map((item) => [item.identityKey, item]));
  return fetched.map((item) => {
    const local = byKey.get(item.identityKey);
    if (!local?.message.startsWith(item.message)) {
      return item;
    }
    return { ...item, id: local.id, message: local.message };
  });
}

export function createBlankEndcardMessage(partial?: Partial<EndcardMessage>): EndcardMessage {
  return {
    id: crypto.randomUUID(),
    text: "",
    ...partial,
  };
}
