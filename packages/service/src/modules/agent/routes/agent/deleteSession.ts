import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { requireAppId } from "#extractors/current-app";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { cleanupSessionFiles } from "#lib/ai-agent/agent-file-store";
import {
  deleteSuccessSchema,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { aiConversationManager } from "#modules/agent/ai-conversation.service";
import { assertPlatformAssistantAccess } from "./entitlement";
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
    const userId = getPrincipalUserId(principal);
    const appId = await requireAppId(c);
    const { id } = c.req.valid("param");

    await assertPlatformAssistantAccess(userId);
    const deleted = await aiConversationManager.dispose(id, userId, appId);
    if (!deleted) {
      throw new HTTPException(404, { message: "Agent session not found" });
    }
    await cleanupSessionFiles(id);
    return c.json({ success: true as const }, 200);
  },
});
