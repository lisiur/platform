import { OpenAPIHono } from "@hono/zod-openapi";
import { listAvailableApisRoute } from "./listAvailable";
import { listAllowedApisRoute } from "./listSelected";
import { replaceAllowedApisRoute } from "./replaceSelection";

const allowedApiRoutesHono = new OpenAPIHono();

const routes = allowedApiRoutesHono.openapiRoutes([
  listAvailableApisRoute,
  listAllowedApisRoute,
  replaceAllowedApisRoute,
] as const);

export { routes as allowedApiRoutes };
