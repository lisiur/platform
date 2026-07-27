import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  serviceUnavailableResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import {
  AgentConfigError,
  agentSessionManager,
} from "#services/agent-session.service";
import { assertAccess } from "#services/role-permission.service";
import { createSessionResponseSchema } from "./schema";

export const createSessionRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/sessions",
    tags: ["Agent"],
    summary: "Create an agent session",
    description:
      "Creates a new AI Agent session for the caller. " +
      "Requires the provider API key to be configured under Settings → AI Agent.",
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...serviceUnavailableResponse,
      ...okResponseFn(createSessionResponseSchema, "The new session id"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "agent::manage");
    const userId = getPrincipalUserId(principal);

    try {
      const sessionId = await agentSessionManager.createSession(userId);
      return c.json({ sessionId }, 200);
    } catch (err) {
      if (err instanceof AgentConfigError) {
        throw new HTTPException(503, { message: err.message });
      }
      throw err;
    }
  },
});
