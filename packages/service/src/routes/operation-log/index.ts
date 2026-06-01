import { OpenAPIHono } from "@hono/zod-openapi";
import { deleteLogsRoute } from "./deleteLogs";
import { getLog } from "./getLog";
import { listLogsRoute } from "./listLogs";

const operationLogRoutesHono = new OpenAPIHono();

const routes = operationLogRoutesHono.openapiRoutes([
  listLogsRoute,
  getLog,
  deleteLogsRoute,
] as const);

export { routes as operationLogRoutes };
