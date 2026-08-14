import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { updatePricingSubscription as updateService } from "#modules/pricing/pricing-subscription.service";
import {
  pricingSubscriptionIdParamSchema,
  pricingSubscriptionSchema,
  updatePricingSubscriptionBodySchema,
} from "./schema";

export const updatePricingSubscriptionRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "updatePricingSubscription",
    method: "put",
    path: "/{id}",
    tags: ["Pricing"],
    summary: "Update a subscription (status / end date)",
    request: {
      params: pricingSubscriptionIdParamSchema,
      body: {
        content: {
          "application/json": { schema: updatePricingSubscriptionBodySchema },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(pricingSubscriptionSchema, "The updated subscription"),
      ...notFoundResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/pricing-subscription:update");
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const subscription = await updateService(id, body);
    logAudit({
      event: "pricing-subscription.updated",
      category: "pricing-subscription",
      c,
    });
    return c.json(subscription, 200);
  },
});
