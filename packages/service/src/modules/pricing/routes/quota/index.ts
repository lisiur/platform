import { OpenAPIHono } from "@hono/zod-openapi";
import { listQuotasRoute } from "./listQuotas";
import { updateQuotaRoute } from "./updateQuota";

const quotaRoutes = new OpenAPIHono();

const routes = quotaRoutes.openapiRoutes([
  listQuotasRoute,
  updateQuotaRoute,
] as const);

export { routes as quotaRoutes };
