import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { getAiModel as getAiModelService } from "#modules/ai/ai-model.service";
import { aiModelIdParamSchema, aiModelSchema } from "./schema";

export const getAiModelRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getAiModel",
    method: "get",
    path: "/{id}",
    tags: ["AI"],
    summary: "Get an AI model",
    request: { params: aiModelIdParamSchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(aiModelSchema, "The AI model"),
      ...notFoundResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-model:list");
    const { id } = c.req.valid("param");
    const model = await getAiModelService(id);
    return c.json(model, 200);
  },
});
