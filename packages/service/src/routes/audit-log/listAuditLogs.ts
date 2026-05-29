import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAdmin } from "#middleware/require-admin";
import { listAuditLogs } from "#services/audit-log.service";
import {
  errorSchema,
  listAuditLogsQuerySchema,
  listAuditLogsResponseSchema,
} from "./schema";

export const listAuditLogsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/",
    tags: ["AuditLog"],
    summary: "List audit logs",
    description:
      "Returns a paginated list of audit logs with optional filters.",
    middleware: requireAdmin,
    request: {
      query: listAuditLogsQuerySchema,
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: listAuditLogsResponseSchema,
          },
        },
        description: "Paginated list of audit logs",
      },
      401: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Unauthorized",
      },
    },
  }),
  handler: async (c) => {
    const query = c.req.valid("query");
    const result = await listAuditLogs(query);
    return c.json(result, 200);
  },
});
