import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  conflictResponse,
  createdResponseFn,
  forbiddenResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { createPricingPlan as createPricingPlanService } from "#modules/pricing/pricing-plan.service";
import { createPricingPlanBodySchema, pricingPlanSchema } from "./schema";

export const createPricingPlanRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "createPricingPlan",
    method: "post",
    path: "/",
    tags: ["Pricing"],
    summary: "Create a pricing plan",
    request: {
      body: {
        content: {
          "application/json": { schema: createPricingPlanBodySchema },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...createdResponseFn(pricingPlanSchema, "The created pricing plan"),
      ...conflictResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/pricing-plan:create");
    const body = c.req.valid("json");
    const plan = await createPricingPlanService(body);
    return c.json(plan, 201);
  },
});
