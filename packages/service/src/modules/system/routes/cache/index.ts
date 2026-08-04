import { OpenAPIHono } from "@hono/zod-openapi";
import { clearAllRoute } from "./clearAll";
import { clearNamespaceRoute } from "./clearNamespace";
import { deleteEntryRoute } from "./deleteEntry";
import { getEntryRoute } from "./getEntry";
import { getStatsRoute } from "./getStats";
import { listKeysRoute } from "./listKeys";
import { updateEntryRoute } from "./updateEntry";

const cacheRoutesHono = new OpenAPIHono();

const routes = cacheRoutesHono.openapiRoutes([
  getStatsRoute,
  listKeysRoute,
  getEntryRoute,
  updateEntryRoute,
  deleteEntryRoute,
  clearNamespaceRoute,
  clearAllRoute,
] as const);

export { routes as cacheRoutes };
