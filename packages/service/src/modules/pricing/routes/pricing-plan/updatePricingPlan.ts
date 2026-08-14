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
import { updatePricingPlan as updatePricingPlanService } from "#modules/pricing/pricing-plan.service";
import {
  pricingPlanIdParamSchema,
  pricingPlanSchema,
  updatePricingPlanBodySchema,
} from "./schema";

export const updatePricingPlanRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "updatePricingPlan",
    method: "put",
    path: "/{id}",
    tags: ["Pricing"],
    summary: "Update a pricing plan",
    description:
      "`code` is immutable. `features` holds feature assignments with quotas for this plan.",
    request: {
      params: pricingPlanIdParamSchema,
      body: {
        content: {
          "application/json": { schema: updatePricingPlanBodySchema },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(pricingPlanSchema, "The updated pricing plan"),
      ...notFoundResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/pricing-plan:update");
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const plan = await updatePricingPlanService(id, body);
    logAudit({ event: "pricing-plan.updated", category: "pricing-plan", c });
    return c.json(plan, 200);
  },
});
