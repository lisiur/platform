import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  conflictResponse,
  createdResponseFn,
  forbiddenResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { createAiModelPricing as createService } from "#modules/ai/ai-model-pricing.service";
import { aiModelPricingSchema, createAiModelPricingBodySchema } from "./schema";

export const createAiModelPricingRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "createAiModelPricing",
    method: "post",
    path: "/",
    tags: ["AI"],
    summary: "Add a pricing row for an AI model",
    description:
      "Prices are dated and contain a daily time policy in a configured time zone. Overlapping effective date ranges for the same model, account, and time zone are rejected.",
    request: {
      body: {
        content: {
          "application/json": { schema: createAiModelPricingBodySchema },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...createdResponseFn(aiModelPricingSchema, "The created pricing row"),
      ...conflictResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-model-pricing:create");
    const body = c.req.valid("json");
    const pricing = await createService(body);
    return c.json(pricing, 201);
  },
});
