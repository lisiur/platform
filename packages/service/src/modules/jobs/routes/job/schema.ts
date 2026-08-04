import { z } from "@hono/zod-openapi";
import { idParamSchema } from "#lib/openapi";

export const errorSchema = z.object({
  code: z.number().openapi({ example: 400 }),
  message: z.string().openapi({ example: "Bad Request" }),
});

export const jobSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    name: z.string().openapi({ example: "session-sweep" }),
    type: z.string().openapi({ example: "session-sweep" }),
    description: z.string().nullable().optional().openapi({
      description: "Human-readable summary of what the job does",
      example: "Sweep expired/revoked sessions",
    }),
    payload: z
      .unknown()
      .nullable()
      .openapi({ description: "Default payload for produced instances" }),
    cronExpression: z.string().nullable().optional().openapi({
      description: "Cron expression (NULL = manual trigger only)",
      example: "0 * * * *",
    }),
    enabled: z.boolean().openapi({ example: true }),
    priority: z
      .enum(["CRITICAL", "HIGH", "NORMAL", "LOW", "IDLE"])
      .openapi({ example: "NORMAL" }),
    maxAttempts: z.number().openapi({ example: 3 }),
    timeoutMs: z.number().openapi({ example: 60000 }),
    lastRunAt: z
      .date()
      .nullable()
      .optional()
      .openapi({ example: "2026-07-04T10:00:00Z" }),
    nextRunAt: z
      .date()
      .nullable()
      .optional()
      .openapi({ example: "2026-07-04T11:00:00Z" }),
    createdAt: z.date().openapi({ example: "2026-07-04T08:00:00Z" }),
    updatedAt: z.date().openapi({ example: "2026-07-04T08:00:00Z" }),
  })
  .openapi("Job");

export const createJobBodySchema = z.object({
  name: z.string().min(1).openapi({
    example: "session-sweep",
    description: "Unique name identifying this job template",
  }),
  type: z.string().min(1).openapi({
    example: "session-sweep",
    description: "Job type identifier (maps to a registered handler)",
  }),
  description: z.string().optional().openapi({
    description: "Optional human-readable summary of what the job does",
    example: "Sweep expired/revoked sessions",
  }),
  payload: z
    .unknown()
    .optional()
    .openapi({ description: "Default payload data" }),
  cronExpression: z.string().optional().openapi({
    description:
      "Cron expression for recurring schedule (omit for manual-trigger only)",
    example: "0 * * * *",
  }),
  enabled: z.boolean().default(true).openapi({ example: true }),
  priority: z
    .enum(["CRITICAL", "HIGH", "NORMAL", "LOW", "IDLE"])
    .default("NORMAL")
    .openapi({ example: "NORMAL" }),
  maxAttempts: z.number().int().min(1).default(3).openapi({ example: 3 }),
  timeoutMs: z.number().int().min(1).default(60000).openapi({ example: 60000 }),
});

export const updateJobBodySchema = createJobBodySchema.partial().extend({
  cronExpression: z.string().nullable().optional().openapi({
    description: "Set to null to disable recurring schedule",
    example: "0 * * * *",
  }),
});

export const listJobsQuerySchema = z.object({
  enabled: z
    .preprocess((v) => {
      if (typeof v === "boolean") return v;
      if (typeof v === "number") return v !== 0;
      if (typeof v === "string") {
        return !["false", "0", "", "no", "off"].includes(v.toLowerCase());
      }
      return v;
    }, z.boolean())
    .optional(),
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
    nextScheduledAt: z.date().nullable().openapi({
      example: "2026-07-04T10:00:00Z",
      description:
        "Scheduled time of the earliest pending job instance, or null if none pending",
    }),
    byStatus: z
      .object({
        PENDING: z.number().openapi({ example: 4 }),
        PROCESSING: z.number().openapi({ example: 1 }),
        COMPLETED: z.number().openapi({ example: 120 }),
        FAILED: z.number().openapi({ example: 2 }),
      })
      .openapi({
        description: "Job instance counts grouped by status (from database)",
      }),
  })
  .openapi("JobExecutorStats");

export type CreateJobBody = z.infer<typeof createJobBodySchema>;
export type UpdateJobBody = z.infer<typeof updateJobBodySchema>;
export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;
