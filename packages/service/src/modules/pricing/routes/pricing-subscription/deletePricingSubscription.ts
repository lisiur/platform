import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  deleteSuccessSchema,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { deletePricingSubscription as deleteService } from "#modules/pricing/pricing-subscription.service";
import { pricingSubscriptionIdParamSchema } from "./schema";

export const deletePricingSubscriptionRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "deletePricingSubscription",
    method: "delete",
    path: "/{id}",
    tags: ["Pricing"],
    summary: "Delete a subscription",
    request: { params: pricingSubscriptionIdParamSchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(deleteSuccessSchema, "The subscription was deleted"),
      ...notFoundResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/pricing-subscription:delete");
    const { id } = c.req.valid("param");
    await deleteService(id);
    logAudit({
      event: "pricing-subscription.deleted",
      category: "pricing-subscription",
      c,
    });
    return c.json({ success: true } as const, 200);
  },
});
