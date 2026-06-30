import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAppId } from "#extractors/app-id";
import { requireSession } from "#extractors/session";
import { okResponseFn, unauthorizedResponse } from "#lib/openapi";
import { listUserNotifications } from "#services/notification/notification-query.service";
import {
  listNotificationsQuerySchema,
  listNotificationsResponseSchema,
} from "./schema";

export const listNotificationsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/",
    tags: ["Notification"],
    summary: "List current user's in-app notifications",
    request: { query: listNotificationsQuerySchema },
    responses: {
      ...unauthorizedResponse,
      ...okResponseFn(listNotificationsResponseSchema, "User notifications"),
    },
  }),
  handler: async (c) => {
    const session = await requireSession(c);
    const appId = await requireAppId(c);
    const query = c.req.valid("query");
    const result = await listUserNotifications({
      userId: session.user.id,
      appId,
      limit: query.limit,
      offset: query.offset,
      unreadOnly: query.unreadOnly,
    });
    return c.json(result, 200);
  },
});
