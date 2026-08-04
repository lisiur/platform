import { OpenAPIHono } from "@hono/zod-openapi";
import { getNotificationChannelRoute } from "./getChannel";
import { listNotificationChannelsRoute } from "./listChannels";
import { listNotificationProvidersRoute } from "./listProviders";
import { updateNotificationChannelRoute } from "./updateChannel";

const notificationChannelRoutesHono = new OpenAPIHono();

const routes = notificationChannelRoutesHono.openapiRoutes([
  listNotificationProvidersRoute,
  listNotificationChannelsRoute,
  getNotificationChannelRoute,
  updateNotificationChannelRoute,
] as const);

export { routes as notificationChannelRoutes };
