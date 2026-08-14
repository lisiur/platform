import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { listAiAgents as listAiAgentsService } from "#modules/ai/ai-agent.service";
import { listAiAgentsQuerySchema, listAiAgentsResponseSchema } from "./schema";

export const listAiAgentsRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listAiAgents",
    method: "get",
    path: "/",
    tags: ["AI"],
    summary: "List AI agents",
    request: { query: listAiAgentsQuerySchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(
        listAiAgentsResponseSchema,
        "Paginated list of AI agents",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-agent:list");
    const { search, limit, offset } = c.req.valid("query");
    const result = await listAiAgentsService({ search, limit, offset });
    return c.json(result, 200);
  },
});
