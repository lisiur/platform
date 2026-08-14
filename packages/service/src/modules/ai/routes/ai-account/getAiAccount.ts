import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { getAiAccount as getAiAccountService } from "#modules/ai/ai-account.service";
import { aiAccountIdParamSchema, aiAccountSchema } from "./schema";

export const getAiAccountRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getAiAccount",
    method: "get",
    path: "/{id}",
    tags: ["AI"],
    summary: "Get an AI account",
    request: { params: aiAccountIdParamSchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(aiAccountSchema, "The AI account"),
      ...notFoundResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-account:list");
    const { id } = c.req.valid("param");
    const account = await getAiAccountService(id);
    return c.json(account, 200);
  },
});
