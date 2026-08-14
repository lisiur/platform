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
import { deleteAiModelPricing as deleteService } from "#modules/ai/ai-model-pricing.service";
import { aiModelPricingIdParamSchema } from "./schema";

export const deleteAiModelPricingRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "deleteAiModelPricing",
    method: "delete",
    path: "/{id}",
    tags: ["AI"],
    summary: "Delete an AI model pricing row",
    request: { params: aiModelPricingIdParamSchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(deleteSuccessSchema, "The pricing row was deleted"),
      ...notFoundResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-model-pricing:delete");
    const { id } = c.req.valid("param");
    await deleteService(id);
    logAudit({
      event: "ai-model-pricing.deleted",
      category: "ai-model-pricing",
      c,
    });
    return c.json({ success: true } as const, 200);
  },
});
