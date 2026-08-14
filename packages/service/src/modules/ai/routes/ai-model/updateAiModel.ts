import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { updateAiModel as updateAiModelService } from "#modules/ai/ai-model.service";
import {
  aiModelIdParamSchema,
  aiModelSchema,
  updateAiModelBodySchema,
} from "./schema";

export const updateAiModelRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "updateAiModel",
    method: "put",
    path: "/{id}",
    tags: ["AI"],
    summary: "Update an AI model",
    request: {
      params: aiModelIdParamSchema,
      body: {
        content: { "application/json": { schema: updateAiModelBodySchema } },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(aiModelSchema, "The updated AI model"),
      ...notFoundResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-model:update");
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const model = await updateAiModelService(id, body);
    logAudit({ event: "ai-model.updated", category: "ai-model", c });
    return c.json(model, 200);
  },
});
