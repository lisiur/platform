import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  conflictResponse,
  deleteSuccessSchema,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { deletePricingPlan as deletePricingPlanService } from "#modules/pricing/pricing-plan.service";
import { pricingPlanIdParamSchema } from "./schema";

export const deletePricingPlanRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "deletePricingPlan",
    method: "delete",
    path: "/{id}",
    tags: ["Pricing"],
    summary: "Delete a pricing plan",
    request: { params: pricingPlanIdParamSchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(deleteSuccessSchema, "The plan was deleted"),
      ...notFoundResponse,
      ...conflictResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/pricing-plan:delete");
    const { id } = c.req.valid("param");
    await deletePricingPlanService(id);
    logAudit({ event: "pricing-plan.deleted", category: "pricing-plan", c });
    return c.json({ success: true } as const, 200);
  },
});
