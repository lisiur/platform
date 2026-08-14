import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAppId } from "#extractors/current-app";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { aiConversationManager } from "#modules/agent/ai-conversation.service";
import { assertPlatformAssistantAccess } from "./entitlement";
import { listSessionsQuerySchema, sessionListResponseSchema } from "./schema";

export const listSessionsRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listSessions",
    method: "get",
    path: "/sessions",
    tags: ["Agent"],
    summary: "List the caller's agent sessions",
    description: "Returns the caller's active agent sessions, newest first.",
    request: {
      query: listSessionsQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(sessionListResponseSchema, "Active sessions"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const appId = await requireAppId(c);
    const { limit, offset } = c.req.valid("query");
    await assertPlatformAssistantAccess(userId);
    const result = await aiConversationManager.listByUser(userId, appId, {
      limit,
      offset,
    });
    return c.json(result, 200);
  },
});
