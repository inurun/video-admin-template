import { z } from "zod";

export const publishSnapshotSchema = z.object({
  status: z.enum(["idle", "running", "success", "error"]),
  logs: z.array(z.string()),
  resultUrl: z.string().nullable(),
  updatedAt: z.number(),
  lastError: z.string().nullable(),
  jobId: z.string().nullable(),
});

export const publishStartRequestSchema = z.object({
  projectPath: z.string().min(1),
  autoSubmit: z.boolean(),
});

export const publishStartResponseSchema = z.object({
  started: z.boolean(),
  reason: z.string().optional(),
  error: z.string().optional(),
  jobId: z.string().optional(),
});

export const publishCancelResponseSchema = z.object({
  canceled: z.boolean(),
  reason: z.string().optional(),
});
