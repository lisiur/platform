import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  createdResponseFn,
  forbiddenResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { createAiKey as createAiKeyService } from "#modules/ai/ai-key.service";
import { aiKeySchema, createAiKeyBodySchema } from "./schema";

export const createAiKeyRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "createAiKey",
    method: "post",
    path: "/",
    tags: ["AI"],
    summary: "Create an AI key",
    description:
      "Stores the secret encrypted at rest. The secret is never readable again; only its mask is returned.",
    request: {
      body: {
        content: { "application/json": { schema: createAiKeyBodySchema } },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...createdResponseFn(aiKeySchema, "The created AI key (masked)"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-key:create");
    const body = c.req.valid("json");
    const key = await createAiKeyService(body);
    return c.json(key, 201);
  },
});
