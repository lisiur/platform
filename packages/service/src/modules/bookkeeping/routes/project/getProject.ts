import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireProjectAccess } from "../../access";
import { getProject } from "../../project.service";
import { projectIdParamSchema, projectSchema } from "./schema";

export const getProjectRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getQianlaiProject",
    method: "get",
    path: "/ledgers/{ledgerId}/projects/{projectId}",
    tags: ["QianlaiProject"],
    summary: "Get a project with its members",
    request: {
      params: projectIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(projectSchema, "The project"),
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
    const project = await getProject(userId, projectId, access.role);
    return c.json(project, 200);
  },
});
