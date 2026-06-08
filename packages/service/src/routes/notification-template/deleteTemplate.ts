import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  deleteSuccessSchema,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { deleteNotificationTemplate } from "#services/notification/template.service";
import { prepend } from "#utils/list";
import { notificationTemplateIdParamSchema } from "./schema";

export const deleteNotificationTemplateRoute = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("notification-template::delete")),
    method: "delete",
    path: "/{id}",
    tags: ["NotificationTemplate"],
    summary: "Delete a notification template",
    request: { params: notificationTemplateIdParamSchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(deleteSuccessSchema, "Deleted notification template"),
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const result = await deleteNotificationTemplate(id);
    return c.json(result, 200);
  },
});
