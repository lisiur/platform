import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  badRequestResponse,
  createdResponseFn,
  forbiddenResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { createNotificationChannel } from "#services/notification/channel.service";
import { prepend } from "#utils/list";
import {
  createNotificationChannelBodySchema,
  notificationChannelSchema,
} from "./schema";

export const createNotificationChannelRoute = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("notification-channel::create")),
    method: "post",
    path: "/",
    tags: ["NotificationChannel"],
    summary: "Create a notification channel",
    request: {
      body: {
        content: {
          "application/json": { schema: createNotificationChannelBodySchema },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...badRequestResponse,
      ...createdResponseFn(
        notificationChannelSchema,
        "Created notification channel",
      ),
    },
  }),
  handler: async (c) => {
    const body = c.req.valid("json");
    const channel = await createNotificationChannel(body);
    return c.json(channel, 201);
  },
});
