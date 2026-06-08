import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { listNotificationChannels } from "#services/notification/channel.service";
import { prepend } from "#utils/list";
import {
  listNotificationChannelsQuerySchema,
  listNotificationChannelsResponseSchema,
} from "./schema";

export const listNotificationChannelsRoute = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("notification-channel::list")),
    method: "get",
    path: "/",
    tags: ["NotificationChannel"],
    summary: "List notification channels",
    request: { query: listNotificationChannelsQuerySchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(
        listNotificationChannelsResponseSchema,
        "Notification channels",
      ),
    },
  }),
  handler: async (c) => {
    const query = c.req.valid("query");
    const channels = await listNotificationChannels(query);
    return c.json({ channels }, 200);
  },
});
