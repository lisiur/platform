import { OpenAPIHono } from "@hono/zod-openapi";
import { getNotificationRecordRoute } from "./getNotificationRecord";
import { listNotificationRecordsRoute } from "./listNotificationRecords";

const notificationRecordRoutesHono = new OpenAPIHono();

const routes = notificationRecordRoutesHono.openapiRoutes([
  listNotificationRecordsRoute,
  getNotificationRecordRoute,
] as const);

export { routes as notificationRecordRoutes };
