import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { deleteAiUsageEvents as deleteAiUsageEventsService } from "#modules/ai/ai-usage-event.service";
import {
  deleteAiUsageEventsBodySchema,
  deleteAiUsageEventsResponseSchema,
} from "./schema";

export const deleteAiUsageEventsRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "deleteAiUsageEvents",
    method: "delete",
    path: "/",
    tags: ["AI"],
    summary: "Delete AI usage events",
    request: {
      body: {
        content: {
          "application/json": { schema: deleteAiUsageEventsBodySchema },
        },
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(deleteAiUsageEventsResponseSchema, "Deletion result"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-usage:delete");
    const { ids } = c.req.valid("json");
    const result = await deleteAiUsageEventsService(ids);
    return c.json(result, 200);
  },
});
