import { g2pItemSchema, type DictionaryEntry, type G2pItem } from "@/_schemas";
import type { ServerEnv } from "@/server/core/env";
import { getHaqumeiApiClient, unwrapHaqumeiData } from "./client";
import { HaqumeiApiError } from "./error";
import { assertHaqumeiTextLength, chunkAnalyzeTexts, HAQUMEI_SCHEMA_VERSION } from "./limits";

/** A kana word (indexed as `wordsOf` counts them) whose reading came from the user dictionary. */
export type DictionaryWord = { index: number; kind: DictionaryEntry["kind"] };

export type AnalyzedItem = { g2p: G2pItem; dictionaryWords: DictionaryWord[] };

async function requestAnalyze(serverEnv: ServerEnv, texts: string[]): Promise<AnalyzedItem[]> {
  const response = await getHaqumeiApiClient(serverEnv).POST("/v1/analyze", {
    body: { schema_version: HAQUMEI_SCHEMA_VERSION, texts },
  });
  const data = unwrapHaqumeiData(response);
  if (data.schema_version !== HAQUMEI_SCHEMA_VERSION) {
    throw new Error(`haqumei-api analyze returned schema_version ${data.schema_version}`);
  }
  if (data.items.length !== texts.length) {
    throw new Error(
      `haqumei-api analyze returned ${data.items.length} items for ${texts.length} texts`,
    );
  }

  // `null` (provenance not fully tracked) counts as no dictionary word.
  return data.items.map((item) => ({
    g2p: g2pItemSchema.parse(item),
    dictionaryWords: (item.dictionary_words ?? []).map((word) => ({
      index: word.word_index,
      kind: word.kind,
    })),
  }));
}

export async function analyzeTexts(serverEnv: ServerEnv, texts: string[]): Promise<G2pItem[]> {
  return (await analyzeTextsWithDictionary(serverEnv, texts)).map((item) => item.g2p);
}

export async function analyzeTextsWithDictionary(
  serverEnv: ServerEnv,
  texts: string[],
): Promise<AnalyzedItem[]> {
  if (texts.length === 0) {
    return [];
  }

  for (const text of texts) {
    assertHaqumeiTextLength(text);
  }

  const items: AnalyzedItem[] = [];
  let chunkOffset = 0;
  for (const chunk of chunkAnalyzeTexts(texts)) {
    try {
      items.push(...(await requestAnalyze(serverEnv, chunk)));
    } catch (error) {
      if (error instanceof HaqumeiApiError) {
        throw error.withChunkOffset(chunkOffset);
      }

      throw error;
    }

    chunkOffset += chunk.length;
  }

  return items;
}

export async function analyzeText(serverEnv: ServerEnv, text: string): Promise<G2pItem> {
  const [item] = await analyzeTexts(serverEnv, [text]);
  if (!item) {
    throw new Error("haqumei-api analyze returned no items");
  }

  return item;
}
