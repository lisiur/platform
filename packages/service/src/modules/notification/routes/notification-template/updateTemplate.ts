import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { updateNotificationTemplate } from "#modules/notification/services/template.service";
import {
  notificationTemplateIdParamSchema,
  notificationTemplateSchema,
  updateNotificationTemplateBodySchema,
} from "./schema";

export const updateNotificationTemplateRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "updateNotificationTemplate",
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
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/notification-template:update");
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const template = await updateNotificationTemplate(id, body);
    return c.json(template, 200);
  },
});
