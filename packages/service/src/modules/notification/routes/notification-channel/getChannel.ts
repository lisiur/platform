import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { getNotificationChannel } from "#modules/notification/services/channel.service";
import {
  notificationChannelIdParamSchema,
  notificationChannelSchema,
} from "./schema";

export const getNotificationChannelRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getNotificationChannel",
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
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/notification-channel:view");
    const { id } = c.req.valid("param");
    const channel = await getNotificationChannel(id);
    return c.json(channel, 200);
  },
});
