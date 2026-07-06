import { z } from "@hono/zod-openapi";
import { idParamSchema } from "#lib/openapi";

export const errorSchema = z.object({
  code: z.number().openapi({ example: 400 }),
  message: z.string().openapi({ example: "Bad Request" }),
});

export const jobSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    type: z.string().openapi({ example: "send-notification" }),
    payload: z.unknown().openapi({ description: "Job payload data" }),
    status: z
      .enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED"])
      .openapi({ example: "PENDING" }),
    priority: z
      .enum(["CRITICAL", "HIGH", "NORMAL", "LOW", "IDLE"])
      .openapi({ example: "NORMAL" }),
    result: z
      .unknown()
      .nullable()
      .optional()
      .openapi({ description: "Job result on completion" }),
    error: z
      .string()
      .nullable()
      .optional()
      .openapi({ description: "Error message on failure" }),
    attempts: z.number().openapi({ example: 0 }),
    maxAttempts: z.number().openapi({ example: 3 }),
    timeoutMs: z.number().openapi({ example: 60000 }),
    scheduledAt: z.date().openapi({ example: "2026-07-04T10:00:00Z" }),
    startedAt: z
      .date()
      .nullable()
      .optional()
      .openapi({ example: "2026-07-04T10:00:01Z" }),
    completedAt: z
      .date()
      .nullable()
      .optional()
      .openapi({ example: "2026-07-04T10:00:05Z" }),
    createdAt: z.date().openapi({ example: "2026-07-04T08:00:00Z" }),
  })
  .openapi("Job");

export const createJobBodySchema = z.object({
  type: z.string().min(1).openapi({
    example: "send-notification",
    description: "Job type identifier",
  }),
  payload: z.unknown().openapi({ description: "Job payload data" }),
  priority: z
    .enum(["CRITICAL", "HIGH", "NORMAL", "LOW", "IDLE"])
    .default("NORMAL")
    .openapi({ example: "NORMAL" }),
  scheduledAt: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), {
      message: "Invalid ISO datetime",
    })
    .optional()
    .openapi({
      description: "ISO 8601 datetime to run job (e.g. 2026-07-04T10:00:00Z)",
      example: "2026-07-04T10:00:00Z",
    }),
  maxAttempts: z.number().int().min(1).default(3).openapi({ example: 3 }),
  timeoutMs: z.number().int().min(1).default(60000).openapi({ example: 60000 }),
});

export const listJobsQuerySchema = z.object({
  status: z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED"]).optional(),
  type: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const jobIdParamSchema = idParamSchema("clx1234567890");

export const listJobsResponseSchema = z
  .object({
    jobs: jobSchema.array(),
    total: z.number(),
  })
  .openapi("ListJobsResponse");

export const jobArchiveSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    type: z.string().openapi({ example: "send-notification" }),
    payload: z.unknown().openapi({ description: "Job payload data" }),
    status: z
      .enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED"])
      .openapi({ example: "COMPLETED" }),
    priority: z
      .enum(["CRITICAL", "HIGH", "NORMAL", "LOW", "IDLE"])
      .openapi({ example: "NORMAL" }),
    result: z
      .unknown()
      .nullable()
      .optional()
      .openapi({ description: "Job result on completion" }),
    error: z
      .string()
      .nullable()
      .optional()
      .openapi({ description: "Error message on failure" }),
    attempts: z.number().openapi({ example: 1 }),
    maxAttempts: z.number().openapi({ example: 3 }),
    timeoutMs: z.number().openapi({ example: 60000 }),
    scheduledAt: z.date().openapi({ example: "2026-07-04T10:00:00Z" }),
    startedAt: z
      .date()
      .nullable()
      .optional()
      .openapi({ example: "2026-07-04T10:00:01Z" }),
    completedAt: z
      .date()
      .nullable()
      .optional()
      .openapi({ example: "2026-07-04T10:00:05Z" }),
    createdAt: z.date().openapi({ example: "2026-07-04T08:00:00Z" }),
    originalJobId: z
      .string()
      .openapi({ description: "ID of the job before archiving" }),
  })
  .openapi("JobArchive");

export const listJobArchivesResponseSchema = z
  .object({
    jobArchives: jobArchiveSchema.array(),
    total: z.number(),
  })
  .openapi("ListJobArchivesResponse");

export type CreateJobBody = z.infer<typeof createJobBodySchema>;
export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;

export const jobExecutorStatsSchema = z
  .object({
    queueSize: z.number().openapi({
      example: 3,
      description: "Jobs waiting in the in-memory queue",
    }),
    pending: z
      .number()
      .openapi({ example: 1, description: "Jobs currently being processed" }),
    concurrency: z
      .number()
      .openapi({ example: 5, description: "Configured max concurrency" }),
    byStatus: z
      .object({
        PENDING: z.number().openapi({ example: 4 }),
        PROCESSING: z.number().openapi({ example: 1 }),
        COMPLETED: z.number().openapi({ example: 120 }),
        FAILED: z.number().openapi({ example: 2 }),
      })
      .openapi({
        description: "Total job counts grouped by status (from database)",
      }),
  })
  .openapi("JobExecutorStats");
