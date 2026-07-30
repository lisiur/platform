import { OpenAPIHono } from "@hono/zod-openapi";
import { createSessionRoute } from "./createSession";
import { deleteSessionRoute } from "./deleteSession";
import { getSessionRoute } from "./getSession";
import { listSessionsRoute } from "./listSessions";
import { sendMessageHandler } from "./sendMessage";
import { uploadFileRoute } from "./uploadFile";

const agentRoutesHono = new OpenAPIHono();

// SSE/data-streaming does not fit the OpenAPI JSON contract, so the messaging
// endpoint is registered as a plain Hono route (intentionally undocumented).
agentRoutesHono.post("/sessions/:id/messages", sendMessageHandler);

const routes = agentRoutesHono.openapiRoutes([
  createSessionRoute,
  listSessionsRoute,
  getSessionRoute,
  deleteSessionRoute,
  uploadFileRoute,
] as const);

export { routes as agentRoutes };
