import { z } from "@hono/zod-openapi";

export const operationLogSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    traceId: z.string().openapi({ example: "018fc9c2-7a7e-4b7b" }),
    sessionId: z.string().nullable().optional(),
    level: z.string().openapi({ example: "error" }),
    source: z.string().nullable().optional(),
    module: z.string().nullable().optional(),
    event: z.string().openapi({ example: "http.request" }),
    message: z.string().nullable().optional(),
    method: z.string().nullable().optional(),
    path: z.string().nullable().optional(),
    statusCode: z.number().nullable().optional(),
    durationMs: z.number().nullable().optional(),
    errorName: z.string().nullable().optional(),
    errorMessage: z.string().nullable().optional(),
    stack: z.string().nullable().optional(),
    metadata: z.unknown().nullable().optional(),
    createdAt: z.date(),
  })
  .openapi("OperationLog");

export const listLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  offset: z.coerce.number().int().min(0).default(0),
  traceId: z.string().optional(),
  sessionId: z.string().optional(),
  level: z.string().optional(),
  source: z.string().optional(),
  module: z.string().optional(),
  event: z.string().optional(),
  method: z.string().optional(),
  path: z.string().optional(),
  statusCode: z.coerce.number().int().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const logIdParamSchema = z.object({
  id: z.string().min(1).openapi({ example: "clx1234567890" }),
});

export const deleteLogsBodySchema = z.object({
  ids: z
    .array(z.string().min(1))
    .min(1)
    .openapi({ example: ["clx1234567890"] }),
});

export const errorSchema = z
  .object({
    code: z.number().openapi({ example: 400 }),
    message: z.string().openapi({ example: "Bad Request" }),
  })
  .openapi("LogError");

export const deleteSuccessSchema = z
  .object({
    success: z.literal(true),
  })
  .openapi("LogDeleteSuccess");

export const listLogsResponseSchema = z
  .object({
    logs: operationLogSchema.array(),
    total: z.number(),
  })
  .openapi("ListLogsResponse");
