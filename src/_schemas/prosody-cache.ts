import { z } from "zod";

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

/** haqumei の韻律抽出の結果。tts ディレクトリの prosody/ に kana ごとに置く派生キャッシュ。 */
export const prosodyExtractSchema = z.object({
  schema_version: z.string(),
  aligner_version: z.string(),
  score: z.number(),
  moras: z.array(prosodyMoraSchema),
  pauses: z.array(prosodyPauseSchema),
});

export type ProsodyExtract = z.infer<typeof prosodyExtractSchema>;
