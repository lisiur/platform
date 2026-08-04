import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
  getPrincipalUserId,
  principalScope,
  requirePrincipal,
} from "#extractors/session";
import { cleanupSessionFiles } from "#lib/ai-agent/agent-file-store";
import {
  deleteSuccessSchema,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { agentSessionManager } from "#modules/agent/agent-session.service";
import { sessionIdParamSchema } from "./schema";

export const deleteSessionRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "deleteSession",
    method: "delete",
    path: "/sessions/{id}",
    tags: ["Agent"],
    summary: "Delete an agent session",
    description:
      "Deletes the agent session and its messages from the database.",
    request: {
      params: sessionIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(deleteSuccessSchema, "Deletion result"),
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

    const deleted = await agentSessionManager.dispose(id, userId);
    if (!deleted) {
      throw new HTTPException(404, { message: "Agent session not found" });
    }
    await cleanupSessionFiles(id);
    return c.json({ success: true as const }, 200);
  },
});
