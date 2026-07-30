import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { getAuditLogById } from "#services/audit-log.service";
import { assertAccess } from "#services/role-permission.service";
import { auditLogIdParamSchema, auditLogSchema } from "./schema";

export const getAuditLog = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getAuditLog",
    method: "get",
    path: "/{id}",
    tags: ["AuditLog"],
    summary: "Get an audit log entry",
    description: "Returns a single audit log by ID.",
    request: {
      params: auditLogIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,

      ...forbiddenResponse,
      ...okResponseFn(auditLogSchema, "The audit log entry"),
      ...notFoundResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/audit-log:view");
    const { id } = c.req.valid("param");
    const log = await getAuditLogById(id);
    return c.json(log, 200);
  },
});
