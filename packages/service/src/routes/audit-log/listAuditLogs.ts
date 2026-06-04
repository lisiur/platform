import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { listAuditLogs } from "#services/audit-log.service";
import { prepend } from "#utils/list";
import {
  listAuditLogsQuerySchema,
  listAuditLogsResponseSchema,
} from "./schema";

export const listAuditLogsRoute = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("audit-log::list")),
    method: "get",
    path: "/",
    tags: ["AuditLog"],
    summary: "List audit logs",
    description:
      "Returns a paginated list of audit logs with optional filters.",
    request: {
      query: listAuditLogsQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,

      ...forbiddenResponse,
      ...okResponseFn(
        listAuditLogsResponseSchema,
        "Paginated list of audit logs",
      ),
    },
  }),
  handler: async (c) => {
    const query = c.req.valid("query");
    const result = await listAuditLogs(query);
    return c.json(result, 200);
  },
});
