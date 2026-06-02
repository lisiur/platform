import { getAuditLogById } from "#services/audit-log.service";
import { definePermissionRoute } from "../shared/admin-route";
import { auditLogIdParamSchema, auditLogSchema, errorSchema } from "./schema";

export const getAuditLog = definePermissionRoute({
  permission: "audit-log::view",
  route: {
    method: "get",
    path: "/{id}",
    tags: ["AuditLog"],
    summary: "Get an audit log entry",
    description: "Returns a single audit log by ID.",
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
      404: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Not found",
      },
    },
  },
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const log = await getAuditLogById(id);
    return c.json(log, 200);
  },
});
