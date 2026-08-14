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
import { deleteAiAccount as deleteAiAccountService } from "#modules/ai/ai-account.service";
import { aiAccountIdParamSchema } from "./schema";

export const deleteAiAccountRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "deleteAiAccount",
    method: "delete",
    path: "/{id}",
    tags: ["AI"],
    summary: "Delete an AI account",
    request: { params: aiAccountIdParamSchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(deleteSuccessSchema, "The account was deleted"),
      ...notFoundResponse,
      ...conflictResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-account:delete");
    const { id } = c.req.valid("param");
    await deleteAiAccountService(id);
    logAudit({ event: "ai-account.deleted", category: "ai-account", c });
    return c.json({ success: true } as const, 200);
  },
});
