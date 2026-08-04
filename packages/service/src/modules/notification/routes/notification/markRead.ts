import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  okResponseFn,
  successSchema,
  unauthorizedResponse,
} from "#lib/openapi";
import { markNotificationRead } from "#modules/notification/services/notification-query.service";
import { idParamSchema } from "./schema";

export const markReadRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "markRead",
    method: "patch",
    path: "/{id}/read",
    tags: ["Notification"],
    summary: "Mark a notification as read",
    request: { params: idParamSchema() },
    responses: {
      ...unauthorizedResponse,
      ...okResponseFn(successSchema, "Marked as read"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const { id } = c.req.valid("param");
    await markNotificationRead(id, getPrincipalUserId(principal));
    return c.json({ success: true }, 200);
  },
});
