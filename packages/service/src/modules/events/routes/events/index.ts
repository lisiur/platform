import { OpenAPIHono } from "@hono/zod-openapi";
import { streamEventsHandler } from "./streamEvents";

// SSE streaming does not fit the OpenAPI JSON contract, so it is registered as
// a plain Hono route (no `openapiRoutes`) and is intentionally undocumented.
const eventsRoutes = new OpenAPIHono();
eventsRoutes.get("/", streamEventsHandler);

export { eventsRoutes };
