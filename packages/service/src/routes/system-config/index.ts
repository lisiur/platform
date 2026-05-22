import { OpenAPIHono } from "@hono/zod-openapi";
import { batchUpsertConfigs } from "./batchUpsertConfigs";
import { deleteConfig } from "./deleteConfig";
import { listAllConfigs } from "./listAllConfigs";
import { listConfigsByGroup } from "./listConfigsByGroup";
import { upsertConfig } from "./upsertConfig";

const systemConfigRoutes = new OpenAPIHono();

const routes = systemConfigRoutes.openapiRoutes([
  listAllConfigs,
  listConfigsByGroup,
  upsertConfig,
  batchUpsertConfigs,
  deleteConfig,
] as const);

export { routes as systemConfigRoutes };
