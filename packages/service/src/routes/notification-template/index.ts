import { OpenAPIHono } from "@hono/zod-openapi";
import { createNotificationTemplateRoute } from "./createTemplate";
import { deleteNotificationTemplateRoute } from "./deleteTemplate";
import { getNotificationTemplateRoute } from "./getTemplate";
import { listNotificationTemplatesRoute } from "./listTemplates";
import { updateNotificationTemplateRoute } from "./updateTemplate";

const notificationTemplateRoutesHono = new OpenAPIHono();

const routes = notificationTemplateRoutesHono.openapiRoutes([
  listNotificationTemplatesRoute,
  createNotificationTemplateRoute,
  getNotificationTemplateRoute,
  updateNotificationTemplateRoute,
  deleteNotificationTemplateRoute,
] as const);

export { routes as notificationTemplateRoutes };
