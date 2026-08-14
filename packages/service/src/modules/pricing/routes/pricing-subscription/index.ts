import { OpenAPIHono } from "@hono/zod-openapi";
import { createPricingSubscriptionRoute } from "./createPricingSubscription";
import { deletePricingSubscriptionRoute } from "./deletePricingSubscription";
import { getPricingSubscriptionRoute } from "./getPricingSubscription";
import { listPricingSubscriptionsRoute } from "./listPricingSubscriptions";
import { updatePricingSubscriptionRoute } from "./updatePricingSubscription";

const pricingSubscriptionRoutes = new OpenAPIHono();

const routes = pricingSubscriptionRoutes.openapiRoutes([
  listPricingSubscriptionsRoute,
  createPricingSubscriptionRoute,
  getPricingSubscriptionRoute,
  updatePricingSubscriptionRoute,
  deletePricingSubscriptionRoute,
] as const);

export { routes as pricingSubscriptionRoutes };
