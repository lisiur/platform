import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { updateNotificationChannel } from "#services/notification/channel.service";
import { prepend } from "#utils/list";
import {
  notificationChannelIdParamSchema,
  notificationChannelSchema,
  updateNotificationChannelBodySchema,
} from "./schema";

export const updateNotificationChannelRoute = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("notification-channel::update")),
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
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const channel = await updateNotificationChannel(id, body);
    return c.json(channel, 200);
  },
});
