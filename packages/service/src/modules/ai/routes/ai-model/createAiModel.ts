import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  conflictResponse,
  createdResponseFn,
  forbiddenResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { createAiModel as createAiModelService } from "#modules/ai/ai-model.service";
import { aiModelSchema, createAiModelBodySchema } from "./schema";

export const createAiModelRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "createAiModel",
    method: "post",
    path: "/",
    tags: ["AI"],
    summary: "Create an AI model",
    request: {
      body: {
        content: { "application/json": { schema: createAiModelBodySchema } },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...createdResponseFn(aiModelSchema, "The created AI model"),
      ...conflictResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-model:create");
    const body = c.req.valid("json");
    const model = await createAiModelService(body);
    return c.json(model, 201);
  },
});
