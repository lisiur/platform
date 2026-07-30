import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  getPrincipalUserId,
  principalScope,
  requirePrincipal,
} from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { agentSessionManager } from "#services/agent-session.service";
import { assertAccess } from "#services/role-permission.service";
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
    const scope = principalScope(principal);
    await assertAccess(
      principal,
      scope === "system" ? "system/agent:chat" : "org/agent:chat",
      scope,
    );
    const userId = getPrincipalUserId(principal);
    const { limit, offset } = c.req.valid("query");
    const result = await agentSessionManager.listByUser(userId, {
      limit,
      offset,
    });
    return c.json(result, 200);
  },
});
