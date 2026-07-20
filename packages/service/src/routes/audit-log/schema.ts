import { z } from "@hono/zod-openapi";

export { errorSchema } from "#lib/openapi";

export const auditLogSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    traceId: z.string().openapi({ example: "018fc9c2-7a7e-4b7b" }),
    authType: z.string().nullable().optional(),
    authTokenId: z.string().nullable().optional(),
    userId: z.string().nullable().optional(),
    userName: z.string().nullable().optional(),
    source: z.string().nullable().optional(),
    event: z.string().openapi({ example: "role.updated" }),
    category: z.string().openapi({ example: "access_control" }),
    severity: z.string().openapi({ example: "warning" }),
    outcome: z.string().openapi({ example: "success" }),
    before: z.unknown().nullable().optional(),
    after: z.unknown().nullable().optional(),
    metadata: z.unknown().nullable().optional(),
    ip: z.string().nullable().optional(),
    userAgent: z.string().nullable().optional(),
    createdAt: z.date(),
  })
  .openapi("AuditLog");

export const listAuditLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  offset: z.coerce.number().int().min(0).default(0),
  traceId: z.string().optional(),
  authType: z.string().optional(),
  authTokenId: z.string().optional(),
  userId: z.string().optional(),
  userName: z.string().optional(),
  source: z.string().optional(),
  event: z.string().optional(),
  category: z.string().optional(),
  severity: z.string().optional(),
  outcome: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const auditLogIdParamSchema = z.object({
  id: z.string().min(1).openapi({ example: "clx1234567890" }),
});

export const listAuditLogsResponseSchema = z
  .object({
    logs: auditLogSchema.array(),
    total: z.number(),
  })
  .openapi("ListAuditLogsResponse");
