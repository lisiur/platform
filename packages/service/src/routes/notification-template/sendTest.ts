import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAppId } from "#extractors/current-app";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { createNotificationsFromTemplate } from "#services/notification/notification.service";
import { getNotificationTemplate } from "#services/notification/template.service";
import { assertAccess } from "#services/role-permission.service";
import {
  notificationTemplateIdParamSchema,
  sendTestNotificationBodySchema,
  sendTestNotificationResponseSchema,
} from "./schema";

export const sendTestNotificationRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "sendTestNotification",
    method: "post",
    path: "/{id}/send-test",
    tags: ["NotificationTemplate"],
    summary: "Send a test notification from a template",
    request: {
      params: notificationTemplateIdParamSchema,
      body: {
        content: {
          "application/json": { schema: sendTestNotificationBodySchema },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      ...okResponseFn(
        sendTestNotificationResponseSchema,
        "Test notification result",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/notification-template:test");
    const appId = await requireAppId(c);
    const { id } = c.req.valid("param");
    const { recipientUserId, variables } = c.req.valid("json");

    const template = await getNotificationTemplate(id);

    const result = await createNotificationsFromTemplate({
      templateKey: template.key,
      recipientUserIds: [recipientUserId],
      appId,
      variables,
      creatorId: getPrincipalUserId(principal),
      source: "admin.test",
    });

    return c.json(result, 200);
  },
});
