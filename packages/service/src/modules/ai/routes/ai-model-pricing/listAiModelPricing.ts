import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { listAiModelPricing as listService } from "#modules/ai/ai-model-pricing.service";
import {
  listAiModelPricingQuerySchema,
  listAiModelPricingResponseSchema,
} from "./schema";

export const listAiModelPricingRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listAiModelPricing",
    method: "get",
    path: "/",
    tags: ["AI"],
    summary: "List AI model pricing rows",
    request: { query: listAiModelPricingQuerySchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(
        listAiModelPricingResponseSchema,
        "Paginated pricing rows",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-model-pricing:list");
    const { modelId, accountId, limit, offset } = c.req.valid("query");
    const result = await listService({
      modelId,
      accountId,
      limit,
      offset,
    });
    return c.json(result, 200);
  },
});
