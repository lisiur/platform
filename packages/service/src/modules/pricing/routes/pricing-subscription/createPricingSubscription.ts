import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  createdResponseFn,
  forbiddenResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { createPricingSubscription as createService } from "#modules/pricing/pricing-subscription.service";
import {
  createPricingSubscriptionBodySchema,
  pricingSubscriptionSchema,
} from "./schema";

export const createPricingSubscriptionRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "createPricingSubscription",
    method: "post",
    path: "/",
    tags: ["Pricing"],
    summary: "Assign a plan to a principal (subscribe)",
    request: {
      body: {
        content: {
          "application/json": { schema: createPricingSubscriptionBodySchema },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...createdResponseFn(
        pricingSubscriptionSchema,
        "The created subscription",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/pricing-subscription:create");
    const body = c.req.valid("json");
    const subscription = await createService(body);
    return c.json(subscription, 201);
  },
});
