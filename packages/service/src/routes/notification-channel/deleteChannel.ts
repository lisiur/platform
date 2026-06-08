import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  deleteSuccessSchema,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { deleteNotificationChannel } from "#services/notification/channel.service";
import { prepend } from "#utils/list";
import { notificationChannelIdParamSchema } from "./schema";

export const deleteNotificationChannelRoute = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("notification-channel::delete")),
    method: "delete",
    path: "/{id}",
    tags: ["NotificationChannel"],
    summary: "Delete a notification channel",
    request: { params: notificationChannelIdParamSchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(deleteSuccessSchema, "Deleted notification channel"),
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const result = await deleteNotificationChannel(id);
    return c.json(result, 200);
  },
});
