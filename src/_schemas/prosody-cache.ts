import { z } from "zod";
import { g2pItemSchema } from "./g2p";

const prosodyMoraSchema = z.object({
  start: z.number(),
  vowel_start: z.number(),
  end: z.number(),
  log_f0: z.number().nullable(),
});

const prosodyPauseSchema = z.object({
  after_mora: z.number().int().nonnegative(),
  sec: z.number(),
});

/** haqumei の韻律抽出の結果。全プロジェクト共通の cache/prosody/extract/ に kana ごとに置く派生キャッシュ。 */
export const prosodyExtractSchema = z.object({
  schema_version: z.string(),
  aligner_version: z.string(),
  score: z.number(),
  moras: z.array(prosodyMoraSchema),
  pauses: z.array(prosodyPauseSchema),
});

export type ProsodyExtract = z.infer<typeof prosodyExtractSchema>;

/**
 * analyzer の kana が読みチェックを通ったあとの kana。cache/prosody/settled/ に
 * 本文・analyzer の kana・参照 TTS ごとに置き、次からは参照 TTS と読みチェックを省く。
 */
export const prosodySettledSchema = z.object({ g2p: g2pItemSchema });

export type ProsodySettled = z.infer<typeof prosodySettledSchema>;
