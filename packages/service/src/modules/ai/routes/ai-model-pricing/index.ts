import { OpenAPIHono } from "@hono/zod-openapi";
import { createAiModelPricingRoute } from "./createAiModelPricing";
import { deleteAiModelPricingRoute } from "./deleteAiModelPricing";
import { getAiModelPricingRoute } from "./getAiModelPricing";
import { listAiModelPricingRoute } from "./listAiModelPricing";
import { updateAiModelPricingRoute } from "./updateAiModelPricing";

const aiModelPricingRoutes = new OpenAPIHono();

const routes = aiModelPricingRoutes.openapiRoutes([
  listAiModelPricingRoute,
  createAiModelPricingRoute,
  getAiModelPricingRoute,
  updateAiModelPricingRoute,
  deleteAiModelPricingRoute,
] as const);

export { routes as aiModelPricingRoutes };
