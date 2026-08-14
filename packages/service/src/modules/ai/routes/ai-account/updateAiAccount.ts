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
import { updateAiAccount as updateAiAccountService } from "#modules/ai/ai-account.service";
import {
  aiAccountIdParamSchema,
  aiAccountSchema,
  updateAiAccountBodySchema,
} from "./schema";

export const updateAiAccountRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "updateAiAccount",
    method: "put",
    path: "/{id}",
    tags: ["AI"],
    summary: "Update an AI account",
    request: {
      params: aiAccountIdParamSchema,
      body: {
        content: { "application/json": { schema: updateAiAccountBodySchema } },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(aiAccountSchema, "The updated AI account"),
      ...notFoundResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-account:update");
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const account = await updateAiAccountService(id, body);
    logAudit({ event: "ai-account.updated", category: "ai-account", c });
    return c.json(account, 200);
  },
});
