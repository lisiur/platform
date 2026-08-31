import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  deleteSuccessSchema,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireProjectAccess } from "../../access";
import { leaveProject } from "../../project.service";
import { projectIdParamSchema } from "./schema";

export const leaveProjectRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "leaveQianlaiProject",
    method: "post",
    path: "/ledgers/{ledgerId}/projects/{projectId}/leave",
    tags: ["QianlaiProject"],
    summary: "Leave a project",
    description:
      "Leaves the project. A guest left with no other projects in the ledger leaves the ledger too.",
    request: {
      params: projectIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...notFoundResponse,
      ...okResponseFn(deleteSuccessSchema, "Departure confirmed"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId, projectId } = c.req.valid("param");
    const access = await requireProjectAccess(userId, projectId, "guest");
    if (access.project.ledgerId !== ledgerId) {
      throw new HTTPException(404, { message: "Project not found" });
    }
    return c.json(await leaveProject(userId, projectId), 200);
  },
});
