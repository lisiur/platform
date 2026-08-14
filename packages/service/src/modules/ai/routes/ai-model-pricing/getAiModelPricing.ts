import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { getAiModelPricing as getService } from "#modules/ai/ai-model-pricing.service";
import { aiModelPricingIdParamSchema, aiModelPricingSchema } from "./schema";

export const getAiModelPricingRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getAiModelPricing",
    method: "get",
    path: "/{id}",
    tags: ["AI"],
    summary: "Get an AI model pricing row",
    request: { params: aiModelPricingIdParamSchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(aiModelPricingSchema, "The pricing row"),
      ...notFoundResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-model-pricing:list");
    const { id } = c.req.valid("param");
    const pricing = await getService(id);
    return c.json(pricing, 200);
  },
});
