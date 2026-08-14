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
import { deleteAiProvider as deleteAiProviderService } from "#modules/ai/ai-provider.service";
import { aiProviderIdParamSchema } from "./schema";

export const deleteAiProviderRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "deleteAiProvider",
    method: "delete",
    path: "/{id}",
    tags: ["AI"],
    summary: "Delete an AI provider",
    request: {
      params: aiProviderIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(deleteSuccessSchema, "The provider was deleted"),
      ...notFoundResponse,
      ...conflictResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-provider:delete");
    const { id } = c.req.valid("param");
    await deleteAiProviderService(id);
    logAudit({ event: "ai-provider.deleted", category: "ai-provider", c });
    return c.json({ success: true } as const, 200);
  },
});
