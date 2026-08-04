import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
  getPrincipalUserId,
  principalScope,
  requirePrincipal,
} from "#extractors/session";
import { prisma } from "#lib/db";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import {
  AgentSessionNotFoundError,
  agentSessionManager,
} from "#modules/agent/agent-session.service";
import { sessionHistoryResponseSchema, sessionIdParamSchema } from "./schema";

export const getSessionRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getAgentSession",
    method: "get",
    path: "/sessions/{id}",
    tags: ["Agent"],
    summary: "Get a session's message history",
    description:
      "Returns the session's conversation as AI SDK UIMessage[] for client-side rehydration.",
    request: {
      params: sessionIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(
        sessionHistoryResponseSchema,
        "Session history as UIMessage[]",
      ),
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
    const { id } = c.req.valid("param");

    try {
      await agentSessionManager.requireSession(id, userId);
      const rows = await prisma.agentMessage.findMany({
        where: { sessionId: id },
        orderBy: { createdAt: "asc" },
        select: { id: true, role: true, parts: true },
      });
      const messages = rows.map((row) => ({
        id: row.id,
        role: row.role,
        parts: row.parts,
      }));
      return c.json(messages, 200);
    } catch (err) {
      if (err instanceof AgentSessionNotFoundError) {
        throw new HTTPException(404, { message: "Agent session not found" });
      }
      throw err;
    }
  },
});
