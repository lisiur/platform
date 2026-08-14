import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { getAiProvider as getAiProviderService } from "#modules/ai/ai-provider.service";
import { aiProviderIdParamSchema, aiProviderSchema } from "./schema";

export const getAiProviderRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getAiProvider",
    method: "get",
    path: "/{id}",
    tags: ["AI"],
    summary: "Get an AI provider",
    request: {
      params: aiProviderIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(aiProviderSchema, "The AI provider"),
      ...notFoundResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-provider:list");
    const { id } = c.req.valid("param");
    const provider = await getAiProviderService(id);
    return c.json(provider, 200);
  },
});
