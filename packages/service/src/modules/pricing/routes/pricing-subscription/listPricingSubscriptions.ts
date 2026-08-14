import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { listPricingSubscriptions as listService } from "#modules/pricing/pricing-subscription.service";
import {
  listPricingSubscriptionsQuerySchema,
  listPricingSubscriptionsResponseSchema,
} from "./schema";

export const listPricingSubscriptionsRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listPricingSubscriptions",
    method: "get",
    path: "/",
    tags: ["Pricing"],
    summary: "List pricing subscriptions",
    request: { query: listPricingSubscriptionsQuerySchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(
        listPricingSubscriptionsResponseSchema,
        "Paginated list of subscriptions",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/pricing-subscription:list");
    const { principalType, principalId, planId, limit, offset } =
      c.req.valid("query");
    const result = await listService({
      principalType,
      principalId,
      planId,
      limit,
      offset,
    });
    return c.json(result, 200);
  },
});
