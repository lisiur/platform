import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  conflictResponse,
  deleteSuccessSchema,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { deleteAiModel as deleteAiModelService } from "#modules/ai/ai-model.service";
import { aiModelIdParamSchema } from "./schema";

export const deleteAiModelRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "deleteAiModel",
    method: "delete",
    path: "/{id}",
    tags: ["AI"],
    summary: "Delete an AI model",
    request: { params: aiModelIdParamSchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(deleteSuccessSchema, "The model was deleted"),
      ...notFoundResponse,
      ...conflictResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-model:delete");
    const { id } = c.req.valid("param");
    await deleteAiModelService(id);
    logAudit({ event: "ai-model.deleted", category: "ai-model", c });
    return c.json({ success: true } as const, 200);
  },
});
