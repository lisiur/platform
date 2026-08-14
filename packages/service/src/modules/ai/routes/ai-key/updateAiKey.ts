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
import { updateAiKey as updateAiKeyService } from "#modules/ai/ai-key.service";
import {
  aiKeyIdParamSchema,
  aiKeySchema,
  updateAiKeyBodySchema,
} from "./schema";

export const updateAiKeyRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "updateAiKey",
    method: "put",
    path: "/{id}",
    tags: ["AI"],
    summary: "Update an AI key",
    description:
      "Provide `secret` to rotate the key (re-encrypted). The secret itself is never returned.",
    request: {
      params: aiKeyIdParamSchema,
      body: {
        content: { "application/json": { schema: updateAiKeyBodySchema } },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(aiKeySchema, "The updated AI key (masked)"),
      ...notFoundResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-key:update");
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const key = await updateAiKeyService(id, body);
    logAudit({ event: "ai-key.updated", category: "ai-key", c });
    return c.json(key, 200);
  },
});
