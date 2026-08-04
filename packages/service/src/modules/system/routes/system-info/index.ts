import { OpenAPIHono } from "@hono/zod-openapi";
import { getSystemInfo } from "./getSystemInfo";

const app = new OpenAPIHono();

const routes = app.openapiRoutes([getSystemInfo] as const);

export { routes as systemInfoRoutes };
