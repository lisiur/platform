import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { listAiUsageEvents as listAiUsageEventsService } from "#modules/ai/ai-usage-event.service";
import {
  listAiUsageEventsQuerySchema,
  listAiUsageEventsResponseSchema,
} from "./schema";

export const listAiUsageEventsRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listAiUsageEvents",
    method: "get",
    path: "/",
    tags: ["AI"],
    summary: "List AI usage events",
    request: { query: listAiUsageEventsQuerySchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(
        listAiUsageEventsResponseSchema,
        "Paginated list of AI usage events",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-usage:list");
    const {
      search,
      userId,
      agentId,
      modelId,
      accountId,
      status,
      startDate,
      endDate,
      limit,
      offset,
    } = c.req.valid("query");
    const result = await listAiUsageEventsService({
      search,
      userId,
      agentId,
      modelId,
      accountId,
      status,
      startDate,
      endDate,
      limit,
      offset,
    });
    return c.json(result, 200);
  },
});
