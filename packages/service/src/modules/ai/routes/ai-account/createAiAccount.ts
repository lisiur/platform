import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  createdResponseFn,
  forbiddenResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { createAiAccount as createAiAccountService } from "#modules/ai/ai-account.service";
import { aiAccountSchema, createAiAccountBodySchema } from "./schema";

export const createAiAccountRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "createAiAccount",
    method: "post",
    path: "/",
    tags: ["AI"],
    summary: "Create an AI account",
    request: {
      body: {
        content: { "application/json": { schema: createAiAccountBodySchema } },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...createdResponseFn(aiAccountSchema, "The created AI account"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-account:create");
    const body = c.req.valid("json");
    const account = await createAiAccountService(body);
    return c.json(account, 201);
  },
});
