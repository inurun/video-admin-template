import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { g2pCacheSchema, type G2pCache, type G2pCacheEntry, type G2pItem } from "@/_schemas";
import { G2P_CACHE_PATH } from "@/server/_shared/storage";
import { stableStringify } from "@/server/_shared/stable-stringify";
import type { G2pUtterance } from "@/server/features/tts/g2p-context";

export type G2pCacheRecord = {
  provider: string;
  text: string;
  entry: G2pCacheEntry;
};

let writing: Promise<void> = Promise.resolve();

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function dictionaryHash(dictionary: G2pUtterance["dictionary"]) {
  return crypto
    .createHash("md5")
    .update(stableStringify(dictionary ?? []))
    .digest("hex");
}

export async function readG2pCache(): Promise<G2pCache> {
  try {
    return g2pCacheSchema.parse(JSON.parse(await fs.readFile(G2P_CACHE_PATH, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[g2p-cache] ignored unreadable cache: ${errorMessage(error)}`);
    }
    return { entries: {} };
  }
}

export function findCachedG2p(cache: G2pCache, utterance: G2pUtterance): G2pItem | undefined {
  const entry = cache.entries[utterance.provider ?? ""]?.[utterance.text];
  if (!entry) {
    return undefined;
  }
  if (entry.source === "llm" && entry.dictionaryHash !== dictionaryHash(utterance.dictionary)) {
    return undefined;
  }
  return entry.g2p;
}

/** 書き込みは直列にする。saved を llm で上書きはしない。 */
export function recordG2pCache(records: readonly G2pCacheRecord[]) {
  if (records.length === 0) {
    return writing;
  }
  writing = writing
    .then(async () => {
      const cache = await readG2pCache();
      for (const { provider, text, entry } of records) {
        const byText = (cache.entries[provider] ??= {});
        if (entry.source === "llm" && byText[text]?.source === "saved") {
          continue;
        }
        byText[text] = entry;
      }
      await fs.mkdir(path.dirname(G2P_CACHE_PATH), { recursive: true });
      await fs.writeFile(G2P_CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
    })
    .catch((error: unknown) => {
      console.warn(`[g2p-cache] failed to write: ${errorMessage(error)}`);
    });
  return writing;
}
