import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { listPricingPlans as listPricingPlansService } from "#modules/pricing/pricing-plan.service";
import {
  listPricingPlansQuerySchema,
  listPricingPlansResponseSchema,
} from "./schema";

export const listPricingPlansRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listPricingPlans",
    method: "get",
    path: "/",
    tags: ["Pricing"],
    summary: "List pricing plans",
    request: { query: listPricingPlansQuerySchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(
        listPricingPlansResponseSchema,
        "Paginated list of plans",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/pricing-plan:list");
    const { search, limit, offset } = c.req.valid("query");
    const result = await listPricingPlansService({ search, limit, offset });
    return c.json(result, 200);
  },
});
