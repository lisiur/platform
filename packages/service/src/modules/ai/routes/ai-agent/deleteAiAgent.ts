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
import { deleteAiAgent as deleteAiAgentService } from "#modules/ai/ai-agent.service";
import { aiAgentIdParamSchema } from "./schema";

export const deleteAiAgentRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "deleteAiAgent",
    method: "delete",
    path: "/{id}",
    tags: ["AI"],
    summary: "Delete an AI agent",
    request: { params: aiAgentIdParamSchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(deleteSuccessSchema, "The agent was deleted"),
      ...notFoundResponse,
      ...conflictResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-agent:delete");
    const { id } = c.req.valid("param");
    await deleteAiAgentService(id);
    logAudit({ event: "ai-agent.deleted", category: "ai-agent", c });
    return c.json({ success: true } as const, 200);
  },
});
