import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { getNotificationChannel } from "#services/notification/channel.service";
import { prepend } from "#utils/list";
import {
  notificationChannelIdParamSchema,
  notificationChannelSchema,
} from "./schema";

export const getNotificationChannelRoute = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("notification-channel::view")),
    method: "get",
    path: "/{id}",
    tags: ["NotificationChannel"],
    summary: "Get a notification channel",
    request: { params: notificationChannelIdParamSchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(notificationChannelSchema, "Notification channel"),
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const channel = await getNotificationChannel(id);
    return c.json(channel, 200);
  },
});
