import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  conflictResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { updateAiModelPricing as updateService } from "#modules/ai/ai-model-pricing.service";
import {
  aiModelPricingIdParamSchema,
  aiModelPricingSchema,
  updateAiModelPricingBodySchema,
} from "./schema";

export const updateAiModelPricingRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "updateAiModelPricing",
    method: "put",
    path: "/{id}",
    tags: ["AI"],
    summary: "Update an AI model pricing row",
    request: {
      params: aiModelPricingIdParamSchema,
      body: {
        content: {
          "application/json": { schema: updateAiModelPricingBodySchema },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(aiModelPricingSchema, "The updated pricing row"),
      ...notFoundResponse,
      ...conflictResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-model-pricing:update");
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const pricing = await updateService(id, body);
    logAudit({
      event: "ai-model-pricing.updated",
      category: "ai-model-pricing",
      c,
    });
    return c.json(pricing, 200);
  },
});
