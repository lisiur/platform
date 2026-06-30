import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireSession } from "#extractors/session";
import {
  okResponseFn,
  successSchema,
  unauthorizedResponse,
} from "#lib/openapi";
import { markNotificationRead } from "#services/notification/notification-query.service";
import { idParamSchema } from "./schema";

export const markReadRoute = defineOpenAPIRoute({
  route: createRoute({
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
    const session = await requireSession(c);
    const { id } = c.req.valid("param");
    await markNotificationRead(id, session.user.id);
    return c.json({ success: true }, 200);
  },
});
