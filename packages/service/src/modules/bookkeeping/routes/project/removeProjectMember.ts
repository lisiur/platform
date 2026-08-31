import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  deleteSuccessSchema,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireProjectAccess } from "../../access";
import { removeProjectMember } from "../../project.service";
import { projectMemberParamSchema } from "./schema";

export const removeProjectMemberRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "removeQianlaiProjectMember",
    method: "delete",
    path: "/ledgers/{ledgerId}/projects/{projectId}/members/{userId}",
    tags: ["QianlaiProject"],
    summary: "Remove a member from the project (editor+)",
    description:
      "A guest left with no other projects in the ledger is removed from the ledger too (their ledger scope would be empty).",
    request: {
      params: projectMemberParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(deleteSuccessSchema, "Removal confirmed"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId, projectId, userId: targetUserId } = c.req.valid("param");
    const access = await requireProjectAccess(userId, projectId, "editor");
    if (access.project.ledgerId !== ledgerId) {
      throw new HTTPException(404, { message: "Project not found" });
    }
    return c.json(
      await removeProjectMember(userId, projectId, targetUserId),
      200,
    );
  },
});
