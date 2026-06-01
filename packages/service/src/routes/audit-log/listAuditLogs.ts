import { listAuditLogs } from "#services/audit-log.service";
import { defineAdminRoute } from "../shared/admin-route";
import {
  listAuditLogsQuerySchema,
  listAuditLogsResponseSchema,
} from "./schema";

export const listAuditLogsRoute = defineAdminRoute({
  route: {
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
      200: {
        content: {
          "application/json": {
            schema: listAuditLogsResponseSchema,
          },
        },
        description: "Paginated list of audit logs",
      },
    },
  },
  handler: async (c) => {
    const query = c.req.valid("query");
    const result = await listAuditLogs(query);
    return c.json(result, 200);
  },
});
