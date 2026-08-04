import { OpenAPIHono } from "@hono/zod-openapi";
import { batchUpsertConfigsRoute } from "./batchUpsertConfigs";
import { deleteConfigRoute } from "./deleteConfig";
import { listAllConfigsRoute } from "./listAllConfigs";
import { listConfigsByGroupRoute } from "./listConfigsByGroup";
import { upsertConfigRoute } from "./upsertConfig";

const systemConfigRoutes = new OpenAPIHono();

const routes = systemConfigRoutes.openapiRoutes([
  listAllConfigsRoute,
  listConfigsByGroupRoute,
  upsertConfigRoute,
  batchUpsertConfigsRoute,
  deleteConfigRoute,
] as const);

export { routes as systemConfigRoutes };
