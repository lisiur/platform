import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { listAuditLogs } from "#services/audit-log.service";
import { assertAccess } from "#services/role-permission.service";
import {
  listAuditLogsQuerySchema,
  listAuditLogsResponseSchema,
} from "./schema";

export const listAuditLogsRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listAuditLogs",
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
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/audit-log:list");
    const query = c.req.valid("query");
    const result = await listAuditLogs(query);
    return c.json(result, 200);
  },
});
