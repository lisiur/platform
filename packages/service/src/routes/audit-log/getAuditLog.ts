import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAdmin } from "#middleware/require-admin";
import { getAuditLogById } from "#services/audit-log.service";
import { auditLogIdParamSchema, auditLogSchema, errorSchema } from "./schema";

export const getAuditLog = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/{id}",
    tags: ["AuditLog"],
    summary: "Get an audit log entry",
    description: "Returns a single audit log by ID.",
    middleware: requireAdmin,
    request: {
      params: auditLogIdParamSchema,
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: auditLogSchema },
        },
        description: "The audit log entry",
      },
      401: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Unauthorized",
      },
      404: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Not found",
      },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const log = await getAuditLogById(id);
    return c.json(log, 200);
  },
});
