import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireProjectAccess } from "../../access";
import { updateProject } from "../../project.service";
import {
  projectIdParamSchema,
  projectSchema,
  updateProjectBodySchema,
} from "./schema";

export const updateProjectRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "updateQianlaiProject",
    method: "patch",
    path: "/ledgers/{ledgerId}/projects/{projectId}",
    tags: ["QianlaiProject"],
    summary: "Rename / re-date / archive a project (editor+)",
    request: {
      params: projectIdParamSchema,
      body: {
        content: {
          "application/json": { schema: updateProjectBodySchema },
        },
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      ...okResponseFn(projectSchema, "The updated project"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId, projectId } = c.req.valid("param");
    const body = c.req.valid("json");
    const access = await requireProjectAccess(userId, projectId, "editor");
    if (access.project.ledgerId !== ledgerId) {
      throw new HTTPException(404, { message: "Project not found" });
    }
    return c.json(await updateProject(userId, projectId, body), 200);
  },
});
