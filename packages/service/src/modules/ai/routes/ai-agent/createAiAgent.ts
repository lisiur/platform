import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  conflictResponse,
  createdResponseFn,
  forbiddenResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { createAiAgent as createAiAgentService } from "#modules/ai/ai-agent.service";
import { aiAgentSchema, createAiAgentBodySchema } from "./schema";

export const createAiAgentRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "createAiAgent",
    method: "post",
    path: "/",
    tags: ["AI"],
    summary: "Create an AI agent",
    request: {
      body: {
        content: { "application/json": { schema: createAiAgentBodySchema } },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...createdResponseFn(aiAgentSchema, "The created AI agent"),
      ...conflictResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-agent:create");
    const body = c.req.valid("json");
    const agent = await createAiAgentService(body);
    return c.json(agent, 201);
  },
});
