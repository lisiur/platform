import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAppId } from "#extractors/current-app";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  serviceUnavailableResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { aiConversationManager } from "#modules/agent/ai-conversation.service";
import { assertPlatformAssistantAccess } from "./entitlement";
import { createSessionResponseSchema } from "./schema";

export const createSessionRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "createSession",
    method: "post",
    path: "/sessions",
    tags: ["Agent"],
    summary: "Create an agent session",
    description:
      "Creates a new AI Agent session for the caller. " +
      "Requires the provider API key to be configured under the application's General tab → AI Agent.",
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...serviceUnavailableResponse,
      ...okResponseFn(createSessionResponseSchema, "The new session id"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const appId = await requireAppId(c);

    await assertPlatformAssistantAccess(userId);
    const sessionId = await aiConversationManager.createSession(userId, appId);
    return c.json({ sessionId }, 200);
  },
});
