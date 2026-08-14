import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { getAiAgent as getAiAgentService } from "#modules/ai/ai-agent.service";
import { aiAgentIdParamSchema, aiAgentSchema } from "./schema";

export const getAiAgentRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getAiAgent",
    method: "get",
    path: "/{id}",
    tags: ["AI"],
    summary: "Get an AI agent",
    request: { params: aiAgentIdParamSchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(aiAgentSchema, "The AI agent"),
      ...notFoundResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-agent:list");
    const { id } = c.req.valid("param");
    const agent = await getAiAgentService(id);
    return c.json(agent, 200);
  },
});
