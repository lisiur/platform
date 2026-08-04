import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { getNotificationTemplate } from "#modules/notification/services/template.service";
import {
  notificationTemplateIdParamSchema,
  notificationTemplateSchema,
} from "./schema";

export const getNotificationTemplateRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getNotificationTemplate",
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
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/notification-template:view");
    const { id } = c.req.valid("param");
    const template = await getNotificationTemplate(id);
    return c.json(template, 200);
  },
});
