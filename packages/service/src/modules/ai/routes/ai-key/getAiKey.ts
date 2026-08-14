import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { getAiKey as getAiKeyService } from "#modules/ai/ai-key.service";
import { aiKeyIdParamSchema, aiKeySchema } from "./schema";

export const getAiKeyRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getAiKey",
    method: "get",
    path: "/{id}",
    tags: ["AI"],
    summary: "Get an AI key",
    request: { params: aiKeyIdParamSchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(aiKeySchema, "The AI key (masked)"),
      ...notFoundResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-key:list");
    const { id } = c.req.valid("param");
    const key = await getAiKeyService(id);
    return c.json(key, 200);
  },
});
