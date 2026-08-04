import { OpenAPIHono } from "@hono/zod-openapi";
import { getUnreadCountRoute } from "./getUnreadCount";
import { listNotificationsRoute } from "./listNotifications";
import { markAllReadRoute } from "./markAllRead";
import { markReadRoute } from "./markRead";

const notificationRoutesHono = new OpenAPIHono();

const routes = notificationRoutesHono.openapiRoutes([
  listNotificationsRoute,
  getUnreadCountRoute,
  markReadRoute,
  markAllReadRoute,
] as const);

export { routes as notificationRoutes };
