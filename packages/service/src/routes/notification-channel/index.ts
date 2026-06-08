import { OpenAPIHono } from "@hono/zod-openapi";
import { createNotificationChannelRoute } from "./createChannel";
import { deleteNotificationChannelRoute } from "./deleteChannel";
import { getNotificationChannelRoute } from "./getChannel";
import { listNotificationChannelsRoute } from "./listChannels";
import { listNotificationProvidersRoute } from "./listProviders";
import { updateNotificationChannelRoute } from "./updateChannel";

const notificationChannelRoutesHono = new OpenAPIHono();

const routes = notificationChannelRoutesHono.openapiRoutes([
  listNotificationProvidersRoute,
  listNotificationChannelsRoute,
  createNotificationChannelRoute,
  getNotificationChannelRoute,
  updateNotificationChannelRoute,
  deleteNotificationChannelRoute,
] as const);

export { routes as notificationChannelRoutes };
