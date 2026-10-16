import type {
  DictionaryEntryInput,
  DictionaryListResponse,
  DictionaryMutationResponse,
  G2pItem,
} from "@/_schemas";
import { api } from "@/app/lib/api-client";
import { parseApiJson } from "@/app/lib/fetch-json";

export const dictionaryKeys = { all: () => ["dictionary"] as const };

export async function fetchDictionary() {
  return parseApiJson<DictionaryListResponse>(await api.dictionary.$get());
}

export async function createDictionaryEntry(entry: DictionaryEntryInput) {
  return parseApiJson<DictionaryMutationResponse>(
    await api.dictionary.entries.$post({ json: entry }),
  );
}

export async function updateDictionaryEntry(id: number, entry: DictionaryEntryInput) {
  return parseApiJson<DictionaryMutationResponse>(
    await fetch(`/api/dictionary/entries/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    }),
  );
}

export async function deleteDictionaryEntry(id: number) {
  const response = await api.dictionary.entries[":id"].$delete({ param: { id: String(id) } });
  if (!response.ok) await parseApiJson(response);
}

export async function analyzeDictionaryText(text: string) {
  const result = await parseApiJson<{ g2p: G2pItem }>(
    await api.dictionary.analyze.$post({ json: { text } }),
  );
  return result.g2p;
}

export async function requestDictionaryPreview(g2p: G2pItem) {
  const response = await api.dictionary.preview.$post({ json: { g2p } });
  if (!response.ok) await parseApiJson(response);
  return response.blob();
}
