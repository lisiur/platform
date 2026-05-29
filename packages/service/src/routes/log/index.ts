import { OpenAPIHono } from "@hono/zod-openapi";
import { deleteLogsRoute } from "./deleteLogs";
import { getLog } from "./getLog";
import { listLogsRoute } from "./listLogs";

const logRoutesHono = new OpenAPIHono();

const routes = logRoutesHono.openapiRoutes([
  listLogsRoute,
  getLog,
  deleteLogsRoute,
] as const);

export { routes as logRoutes };
