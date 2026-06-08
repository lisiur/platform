import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  badRequestResponse,
  createdResponseFn,
  forbiddenResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { createNotificationTemplate } from "#services/notification/template.service";
import { prepend } from "#utils/list";
import {
  createNotificationTemplateBodySchema,
  notificationTemplateSchema,
} from "./schema";

export const createNotificationTemplateRoute = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("notification-template::create")),
    method: "post",
    path: "/",
    tags: ["NotificationTemplate"],
    summary: "Create a notification template",
    request: {
      body: {
        content: {
          "application/json": { schema: createNotificationTemplateBodySchema },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...badRequestResponse,
      ...createdResponseFn(
        notificationTemplateSchema,
        "Created notification template",
      ),
    },
  }),
  handler: async (c) => {
    const body = c.req.valid("json");
    const template = await createNotificationTemplate(body);
    return c.json(template, 201);
  },
});
