import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { getNotificationRecordById } from "#services/notification-record.service";
import { assertAccess } from "#services/role-permission.service";
import { idParamSchema, notificationRecordSchema } from "./schema";

export const getNotificationRecordRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getNotificationRecord",
    method: "get",
    path: "/{id}",
    tags: ["NotificationRecord"],
    summary: "Get a notification record",
    description: "Returns a single notification record by ID for admin review.",
    request: { params: idParamSchema() },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(notificationRecordSchema, "The notification record"),
      ...notFoundResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/notification-record:view");
    const { id } = c.req.valid("param");
    const record = await getNotificationRecordById(id);
    return c.json(record, 200);
  },
});
