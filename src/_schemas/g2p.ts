import { z } from "zod";

const g2pWarningCodeSchema = z.enum(["unknown_word", "ignored_token"]);

const g2pSourceSpanSchema = z.object({
  start_utf16: z.number().int().nonnegative(),
  end_utf16: z.number().int().nonnegative(),
});

const g2pWarningSchema = z.object({
  code: g2pWarningCodeSchema,
  source_span: g2pSourceSpanSchema.nullable().optional(),
});

function isSourceSpanInsideText(text: string, span: { start_utf16: number; end_utf16: number }) {
  return span.start_utf16 <= span.end_utf16 && span.end_utf16 <= text.length;
}

const g2pItemFields = {
  text: z.string(),
  kana: z.string(),
  warnings: z.array(g2pWarningSchema).default([]),
};

function refineG2pWarnings(
  item: { text: string; warnings: z.infer<typeof g2pWarningSchema>[] },
  ctx: z.RefinementCtx,
) {
  for (const [index, warning] of item.warnings.entries()) {
    if (warning.source_span == null) {
      continue;
    }
    if (!isSourceSpanInsideText(item.text, warning.source_span)) {
      ctx.addIssue({
        code: "custom",
        message: "source_span is outside text",
        path: ["warnings", index, "source_span"],
      });
    }
  }
}

export const g2pItemSchema = z.object(g2pItemFields).superRefine(refineG2pWarnings);

export type G2pItem = z.infer<typeof g2pItemSchema>;
export type G2pSourceSpan = z.infer<typeof g2pSourceSpanSchema>;
export type G2pWarning = z.infer<typeof g2pWarningSchema>;
