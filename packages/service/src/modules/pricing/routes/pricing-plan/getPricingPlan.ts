import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { getPricingPlan as getPricingPlanService } from "#modules/pricing/pricing-plan.service";
import { pricingPlanIdParamSchema, pricingPlanSchema } from "./schema";

export const getPricingPlanRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getPricingPlan",
    method: "get",
    path: "/{id}",
    tags: ["Pricing"],
    summary: "Get a pricing plan",
    request: { params: pricingPlanIdParamSchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(pricingPlanSchema, "The pricing plan"),
      ...notFoundResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/pricing-plan:list");
    const { id } = c.req.valid("param");
    const plan = await getPricingPlanService(id);
    return c.json(plan, 200);
  },
});
