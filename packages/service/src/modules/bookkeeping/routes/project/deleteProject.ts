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
import { deleteProject } from "../../project.service";
import { projectIdParamSchema } from "./schema";

export const deleteProjectRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "deleteQianlaiProject",
    method: "delete",
    path: "/ledgers/{ledgerId}/projects/{projectId}",
    tags: ["QianlaiProject"],
    summary: "Delete a project (owner only)",
    description:
      "Hard-deletes the project. Entries survive unassigned (the FK is SetNull); the project's share codes are removed with it.",
    request: {
      params: projectIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(deleteSuccessSchema, "Deletion confirmed"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId, projectId } = c.req.valid("param");
    const access = await requireProjectAccess(userId, projectId, "owner");
    if (access.project.ledgerId !== ledgerId) {
      throw new HTTPException(404, { message: "Project not found" });
    }
    return c.json(await deleteProject(userId, projectId), 200);
  },
});
