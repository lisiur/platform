import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { updateNotificationChannel } from "#services/notification/channel.service";
import { assertAccess } from "#services/role-permission.service";
import {
  notificationChannelIdParamSchema,
  notificationChannelSchema,
  updateNotificationChannelBodySchema,
} from "./schema";

export const updateNotificationChannelRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "put",
    path: "/{id}",
    tags: ["NotificationChannel"],
    summary: "Update a notification channel",
    request: {
      params: notificationChannelIdParamSchema,
      body: {
        content: {
          "application/json": { schema: updateNotificationChannelBodySchema },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...badRequestResponse,
      ...notFoundResponse,
      ...okResponseFn(
        notificationChannelSchema,
        "Updated notification channel",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/notification-channel:update");
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const channel = await updateNotificationChannel(id, body);
    return c.json(channel, 200);
  },
});
