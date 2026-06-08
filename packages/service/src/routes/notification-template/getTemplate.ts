import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { getNotificationTemplate } from "#services/notification/template.service";
import { prepend } from "#utils/list";
import {
  notificationTemplateIdParamSchema,
  notificationTemplateSchema,
} from "./schema";

export const getNotificationTemplateRoute = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("notification-template::view")),
    method: "get",
    path: "/{id}",
    tags: ["NotificationTemplate"],
    summary: "Get a notification template",
    request: { params: notificationTemplateIdParamSchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(notificationTemplateSchema, "Notification template"),
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const template = await getNotificationTemplate(id);
    return c.json(template, 200);
  },
});
