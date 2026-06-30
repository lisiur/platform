import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAppId } from "#extractors/app-id";
import { requireSession } from "#extractors/session";
import {
  okResponseFn,
  successSchema,
  unauthorizedResponse,
} from "#lib/openapi";
import { markAllNotificationsRead } from "#services/notification/notification-query.service";

export const markAllReadRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "patch",
    path: "/read-all",
    tags: ["Notification"],
    summary: "Mark all notifications as read",
    responses: {
      ...unauthorizedResponse,
      ...okResponseFn(successSchema, "All marked as read"),
    },
  }),
  handler: async (c) => {
    const session = await requireSession(c);
    const appId = await requireAppId(c);
    await markAllNotificationsRead(session.user.id, appId);
    return c.json({ success: true }, 200);
  },
});
