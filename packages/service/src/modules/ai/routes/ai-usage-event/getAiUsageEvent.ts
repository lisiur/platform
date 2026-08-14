import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { getAiUsageEvent as getAiUsageEventService } from "#modules/ai/ai-usage-event.service";
import { aiUsageEventIdParamSchema, aiUsageEventSchema } from "./schema";

export const getAiUsageEventRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getAiUsageEvent",
    method: "get",
    path: "/{id}",
    tags: ["AI"],
    summary: "Get an AI usage event",
    request: { params: aiUsageEventIdParamSchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(aiUsageEventSchema, "The AI usage event"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-usage:view");
    const { id } = c.req.valid("param");
    const event = await getAiUsageEventService(id);
    return c.json(event, 200);
  },
});
