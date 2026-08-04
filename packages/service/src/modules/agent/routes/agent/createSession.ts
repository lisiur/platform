import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { requireAppId } from "#extractors/current-app";
import {
  getPrincipalUserId,
  principalScope,
  requirePrincipal,
} from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  serviceUnavailableResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import {
  AgentConfigError,
  agentSessionManager,
} from "#modules/agent/agent-session.service";
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
    const scope = principalScope(principal);
    await assertAccess(
      principal,
      scope === "system" ? "system/agent:chat" : "org/agent:chat",
      scope,
    );
    const userId = getPrincipalUserId(principal);
    const appId = await requireAppId(c);

    try {
      const sessionId = await agentSessionManager.createSession(userId, appId);
      return c.json({ sessionId }, 200);
    } catch (err) {
      if (err instanceof AgentConfigError) {
        throw new HTTPException(503, { message: err.message });
      }
      throw err;
    }
  },
});
