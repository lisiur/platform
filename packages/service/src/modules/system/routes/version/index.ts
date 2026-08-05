import { OpenAPIHono } from "@hono/zod-openapi";
import { applyUpdateRoute } from "./applyUpdate";
import { getLatestRoute } from "./getLatest";
import { getUpdateStatusRoute } from "./getUpdateStatus";
import { getVersion } from "./getVersion";

const app = new OpenAPIHono();

const routes = app.openapiRoutes([
  getVersion,
  getLatestRoute,
  applyUpdateRoute,
  getUpdateStatusRoute,
] as const);

export { routes as versionRoutes };
