import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { listNotificationTemplates } from "#services/notification/template.service";
import { prepend } from "#utils/list";
import {
  listNotificationTemplatesQuerySchema,
  listNotificationTemplatesResponseSchema,
} from "./schema";

export const listNotificationTemplatesRoute = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("notification-template::list")),
    method: "get",
    path: "/",
    tags: ["NotificationTemplate"],
    summary: "List notification templates",
    request: { query: listNotificationTemplatesQuerySchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(
        listNotificationTemplatesResponseSchema,
        "Notification templates",
      ),
    },
  }),
  handler: async (c) => {
    const query = c.req.valid("query");
    const templates = await listNotificationTemplates(query);
    return c.json({ templates }, 200);
  },
});
