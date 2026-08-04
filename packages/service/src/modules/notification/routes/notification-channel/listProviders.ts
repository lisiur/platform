import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { listNotificationChannelProviders } from "#modules/notification/services/channel.service";
import { listNotificationProvidersResponseSchema } from "./schema";

export const listNotificationProvidersRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listNotificationProviders",
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
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/notification-channel:list");
    return c.json({ providers: listNotificationChannelProviders() }, 200);
  },
});
