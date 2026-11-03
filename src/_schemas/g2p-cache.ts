import { z } from "zod";
import { g2pItemSchema } from "./g2p";

/**
 * llm は生成したときの辞書ヒント（dictionaryHash）が今と同じときだけ使う。
 * saved はエディタで保存された読みなので、辞書が変わっても使う。
 */
const g2pCacheEntrySchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("llm"), g2p: g2pItemSchema, dictionaryHash: z.string() }),
  z.object({ source: z.literal("saved"), g2p: g2pItemSchema }),
]);

/** 読みの完全一致キャッシュ。entries[provider][読み上げる文] に読みを持つ。 */
export const g2pCacheSchema = z.object({
  entries: z.record(z.string(), z.record(z.string(), g2pCacheEntrySchema)),
});

export type G2pCacheEntry = z.infer<typeof g2pCacheEntrySchema>;
export type G2pCache = z.infer<typeof g2pCacheSchema>;
