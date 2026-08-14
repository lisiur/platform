import { OpenAPIHono } from "@hono/zod-openapi";
import { deleteAiUsageEventsRoute } from "./deleteAiUsageEvents";
import { getAiUsageEventRoute } from "./getAiUsageEvent";
import { listAiUsageEventsRoute } from "./listAiUsageEvents";

const aiUsageEventRoutes = new OpenAPIHono();

const routes = aiUsageEventRoutes.openapiRoutes([
  listAiUsageEventsRoute,
  getAiUsageEventRoute,
  deleteAiUsageEventsRoute,
] as const);

export { routes as aiUsageEventRoutes };
