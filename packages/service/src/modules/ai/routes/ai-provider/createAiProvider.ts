import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  createdResponseFn,
  forbiddenResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { createAiProvider as createAiProviderService } from "#modules/ai/ai-provider.service";
import { aiProviderSchema, createAiProviderBodySchema } from "./schema";

export const createAiProviderRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "createAiProvider",
    method: "post",
    path: "/",
    tags: ["AI"],
    summary: "Create an AI provider",
    request: {
      body: {
        content: {
          "application/json": { schema: createAiProviderBodySchema },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...createdResponseFn(aiProviderSchema, "The created AI provider"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-provider:create");
    const body = c.req.valid("json");
    const provider = await createAiProviderService(body);
    return c.json(provider, 201);
  },
});
