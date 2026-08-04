import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { listNotificationChannels } from "#modules/notification/services/channel.service";
import { listNotificationChannelsResponseSchema } from "./schema";

export const listNotificationChannelsRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listNotificationChannels",
    method: "get",
    path: "/",
    tags: ["NotificationChannel"],
    summary: "List notification channels",
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
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/notification-channel:list");
    const channels = await listNotificationChannels();
    return c.json({ channels }, 200);
  },
});
