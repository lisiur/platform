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
import { deleteAiKey as deleteAiKeyService } from "#modules/ai/ai-key.service";
import { aiKeyIdParamSchema } from "./schema";

export const deleteAiKeyRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "deleteAiKey",
    method: "delete",
    path: "/{id}",
    tags: ["AI"],
    summary: "Delete an AI key",
    request: { params: aiKeyIdParamSchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(deleteSuccessSchema, "The key was deleted"),
      ...notFoundResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-key:delete");
    const { id } = c.req.valid("param");
    await deleteAiKeyService(id);
    logAudit({ event: "ai-key.deleted", category: "ai-key", c });
    return c.json({ success: true } as const, 200);
  },
});
