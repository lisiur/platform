import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { updateNotificationTemplate } from "#services/notification/template.service";
import { prepend } from "#utils/list";
import {
  notificationTemplateIdParamSchema,
  notificationTemplateSchema,
  updateNotificationTemplateBodySchema,
} from "./schema";

export const updateNotificationTemplateRoute = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("notification-template::update")),
    method: "put",
    path: "/{id}",
    tags: ["NotificationTemplate"],
    summary: "Update a notification template",
    request: {
      params: notificationTemplateIdParamSchema,
      body: {
        content: {
          "application/json": { schema: updateNotificationTemplateBodySchema },
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
        notificationTemplateSchema,
        "Updated notification template",
      ),
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const template = await updateNotificationTemplate(id, body);
    return c.json(template, 200);
  },
});
