import { OpenAPIHono } from "@hono/zod-openapi";
import { getAuditLog } from "./getAuditLog";
import { listAuditLogsRoute } from "./listAuditLogs";

const auditLogRoutesHono = new OpenAPIHono();

const routes = auditLogRoutesHono.openapiRoutes([
  listAuditLogsRoute,
  getAuditLog,
] as const);

export { routes as auditLogRoutes };
