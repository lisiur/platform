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
import { updateAiAgent as updateAiAgentService } from "#modules/ai/ai-agent.service";
import {
  aiAgentIdParamSchema,
  aiAgentSchema,
  updateAiAgentBodySchema,
} from "./schema";

export const updateAiAgentRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "updateAiAgent",
    method: "put",
    path: "/{id}",
    tags: ["AI"],
    summary: "Update an AI agent",
    description:
      "`code` is immutable. Provide `categories` to replace the agent's required model categories.",
    request: {
      params: aiAgentIdParamSchema,
      body: {
        content: { "application/json": { schema: updateAiAgentBodySchema } },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(aiAgentSchema, "The updated AI agent"),
      ...notFoundResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-agent:update");
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const agent = await updateAiAgentService(id, body);
    logAudit({ event: "ai-agent.updated", category: "ai-agent", c });
    return c.json(agent, 200);
  },
});
