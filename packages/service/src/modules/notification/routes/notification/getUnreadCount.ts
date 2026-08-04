import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAppId } from "#extractors/current-app";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { okResponseFn, unauthorizedResponse } from "#lib/openapi";
import { getUserUnreadCount } from "#modules/notification/services/notification-query.service";
import { unreadCountResponseSchema } from "./schema";

export const getUnreadCountRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getUnreadCount",
    method: "get",
    path: "/unread-count",
    tags: ["Notification"],
    summary: "Get unread notification count",
    responses: {
      ...unauthorizedResponse,
      ...okResponseFn(unreadCountResponseSchema, "Unread count"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const appId = await requireAppId(c);
    const count = await getUserUnreadCount(
      getPrincipalUserId(principal),
      appId,
    );
    return c.json({ count }, 200);
  },
});
