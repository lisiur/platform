import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { listNotificationRecords } from "#modules/notification/notification-record.service";
import {
  listNotificationRecordsQuerySchema,
  listNotificationRecordsResponseSchema,
} from "./schema";

export const listNotificationRecordsRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listNotificationRecords",
    method: "get",
    path: "/",
    tags: ["NotificationRecord"],
    summary: "List notification records",
    description:
      "Returns a paginated admin list of notification records with optional filters.",
    request: { query: listNotificationRecordsQuerySchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(
        listNotificationRecordsResponseSchema,
        "Paginated list of notification records",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/notification-record:list");
    const query = c.req.valid("query");
    const result = await listNotificationRecords(query);
    return c.json(result, 200);
  },
});
