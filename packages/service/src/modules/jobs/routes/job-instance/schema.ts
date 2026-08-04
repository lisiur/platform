import { z } from "@hono/zod-openapi";
import { idParamSchema } from "#lib/openapi";

export const jobInstanceSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    jobId: z.string().nullable().optional().openapi({
      description:
        "ID of the job template that produced this instance (null for ad-hoc)",
      example: "clxabcdef",
    }),
    type: z.string().openapi({ example: "send-notification" }),
    description: z.string().nullable().optional().openapi({
      description: "Human-readable summary of what the instance does",
      example: "Send welcome email to new users",
    }),
    payload: z.unknown().openapi({ description: "Job instance payload data" }),
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
      .openapi({ description: "Result on completion" }),
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
  .openapi("JobInstance");

export const createJobInstanceBodySchema = z.object({
  type: z.string().min(1).openapi({
    example: "send-notification",
    description: "Job type identifier (maps to a registered handler)",
  }),
  description: z.string().optional().openapi({
    description: "Optional human-readable summary of what the instance does",
    example: "Send welcome email to new users",
  }),
  payload: z.unknown().openapi({ description: "Job instance payload data" }),
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
      description: "ISO 8601 datetime to run (e.g. 2026-07-04T10:00:00Z)",
      example: "2026-07-04T10:00:00Z",
    }),
  maxAttempts: z.number().int().min(1).default(3).openapi({ example: 3 }),
  timeoutMs: z.number().int().min(1).default(60000).openapi({ example: 60000 }),
});

export const listJobInstancesQuerySchema = z.object({
  status: z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED"]).optional(),
  type: z.string().optional(),
  jobId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const jobInstanceIdParamSchema = idParamSchema("clx1234567890");

export const listJobInstancesResponseSchema = z
  .object({
    jobs: jobInstanceSchema.array(),
    total: z.number(),
  })
  .openapi("ListJobInstancesResponse");

export type CreateJobInstanceBody = z.infer<typeof createJobInstanceBodySchema>;
export type ListJobInstancesQuery = z.infer<typeof listJobInstancesQuerySchema>;
