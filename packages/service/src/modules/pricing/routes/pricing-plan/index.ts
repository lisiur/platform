import { OpenAPIHono } from "@hono/zod-openapi";
import { createPricingPlanRoute } from "./createPricingPlan";
import { deletePricingPlanRoute } from "./deletePricingPlan";
import { getPricingPlanRoute } from "./getPricingPlan";
import { listPricingPlansRoute } from "./listPricingPlans";
import { updatePricingPlanRoute } from "./updatePricingPlan";

const pricingPlanRoutes = new OpenAPIHono();

const routes = pricingPlanRoutes.openapiRoutes([
  listPricingPlansRoute,
  createPricingPlanRoute,
  getPricingPlanRoute,
  updatePricingPlanRoute,
  deletePricingPlanRoute,
] as const);

export { routes as pricingPlanRoutes };
