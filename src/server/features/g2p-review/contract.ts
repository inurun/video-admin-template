import { z } from "zod";
import { g2pReviewItemSchema } from "@/_schemas";

const g2pComparisonSchema = z.union([
  z.object({ reading: z.literal(false) }),
  z.object({
    reading: z.literal(true),
    boundaries: z.number(),
    missingBoundaries: z.number(),
    extraBoundaries: z.number(),
    alignedPhrases: z.number(),
    wrongAccents: z.number(),
  }),
]);

export const g2pEvalReportSchema = z.object({
  startedAt: z.string(),
  label: z.string(),
  promptHash: z.string(),
  profileId: z.string(),
  runs: z.number(),
  cases: z.array(
    z.object({
      setName: z.string(),
      id: z.string(),
      provider: z.string(),
      text: z.string(),
      truth: z.string().optional(),
      alternatives: z.array(z.string()).default([]),
      runs: z.array(
        z.object({
          kana: z.string(),
          source: z.string(),
          comparison: g2pComparisonSchema.optional(),
        }),
      ),
    }),
  ),
});

const g2pReviewCandidateSchema = z.object({
  kana: z.string(),
  prosody: z.string(),
  count: z.number().int().positive(),
  status: z.enum(["truth", "alternative", "other"]),
});

export const g2pReviewViewItemSchema = g2pReviewItemSchema.extend({
  candidates: z.array(g2pReviewCandidateSchema),
  /** 正解にも別解にもない候補が残っている。 */
  mismatched: z.boolean(),
});

export const g2pReviewViewSchema = z.object({
  sets: z.array(z.string()),
  items: z.array(g2pReviewViewItemSchema),
});

export const g2pReviewUpdateSchema = z.object({
  kana: z.string().min(1),
  reviewed: z.boolean(),
});

export const g2pReviewAlternativeSchema = z.object({
  kana: z.string().min(1),
  accepted: z.boolean(),
});

export const g2pReviewContract = {
  get: { response: g2pReviewViewSchema },
  update: { json: g2pReviewUpdateSchema, response: g2pReviewViewItemSchema },
  alternative: { json: g2pReviewAlternativeSchema, response: g2pReviewViewItemSchema },
};

export type G2pEvalReport = z.infer<typeof g2pEvalReportSchema>;
export type G2pReviewView = z.infer<typeof g2pReviewViewSchema>;
export type G2pReviewViewItem = z.infer<typeof g2pReviewViewItemSchema>;
export type G2pReviewCandidate = z.infer<typeof g2pReviewCandidateSchema>;
