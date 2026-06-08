import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { listNotificationChannelProviders } from "#services/notification/channel.service";
import { prepend } from "#utils/list";
import { listNotificationProvidersResponseSchema } from "./schema";

export const listNotificationProvidersRoute = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("notification-channel::list")),
    method: "get",
    path: "/providers",
    tags: ["NotificationChannel"],
    summary: "List notification channel provider types",
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(
        listNotificationProvidersResponseSchema,
        "Notification provider types",
      ),
    },
  }),
  handler: (c) => {
    return c.json({ providers: listNotificationChannelProviders() }, 200);
  },
});
