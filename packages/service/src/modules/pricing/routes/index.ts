import { OpenAPIHono } from "@hono/zod-openapi";
import { featureRoutes } from "./feature";
import { pricingPlanRoutes } from "./pricing-plan";
import { pricingSubscriptionRoutes } from "./pricing-subscription";
import { quotaRoutes } from "./quota";

const routes = new OpenAPIHono()
  .route("/plans", pricingPlanRoutes)
  .route("/features", featureRoutes)
  .route("/subscriptions", pricingSubscriptionRoutes)
  .route("/quotas", quotaRoutes);

export { routes as pricingRoutes };
