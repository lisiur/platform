import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { getPricingSubscription as getService } from "#modules/pricing/pricing-subscription.service";
import {
  pricingSubscriptionIdParamSchema,
  pricingSubscriptionSchema,
} from "./schema";

export const getPricingSubscriptionRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getPricingSubscription",
    method: "get",
    path: "/{id}",
    tags: ["Pricing"],
    summary: "Get a pricing subscription",
    request: { params: pricingSubscriptionIdParamSchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(pricingSubscriptionSchema, "The subscription"),
      ...notFoundResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/pricing-subscription:list");
    const { id } = c.req.valid("param");
    const subscription = await getService(id);
    return c.json(subscription, 200);
  },
});
