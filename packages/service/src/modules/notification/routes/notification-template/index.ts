import { OpenAPIHono } from "@hono/zod-openapi";
import { getNotificationTemplateRoute } from "./getTemplate";
import { listNotificationTemplatesRoute } from "./listTemplates";
import { sendTestNotificationRoute } from "./sendTest";
import { updateNotificationTemplateRoute } from "./updateTemplate";

const notificationTemplateRoutesHono = new OpenAPIHono();

const routes = notificationTemplateRoutesHono.openapiRoutes([
  listNotificationTemplatesRoute,
  getNotificationTemplateRoute,
  updateNotificationTemplateRoute,
  sendTestNotificationRoute,
] as const);

export { routes as notificationTemplateRoutes };
