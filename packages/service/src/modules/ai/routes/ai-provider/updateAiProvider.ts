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
import { updateAiProvider as updateAiProviderService } from "#modules/ai/ai-provider.service";
import {
  aiProviderIdParamSchema,
  aiProviderSchema,
  updateAiProviderBodySchema,
} from "./schema";

export const updateAiProviderRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "updateAiProvider",
    method: "put",
    path: "/{id}",
    tags: ["AI"],
    summary: "Update an AI provider",
    request: {
      params: aiProviderIdParamSchema,
      body: {
        content: {
          "application/json": { schema: updateAiProviderBodySchema },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(aiProviderSchema, "The updated AI provider"),
      ...notFoundResponse,
      ...conflictResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-provider:update");
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const provider = await updateAiProviderService(id, body);
    logAudit({ event: "ai-provider.updated", category: "ai-provider", c });
    return c.json(provider, 200);
  },
});
