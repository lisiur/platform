import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  createdResponseFn,
  forbiddenResponse,
  notFoundResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireProjectAccess } from "../../access";
import { addProjectMember } from "../../project.service";
import {
  addProjectMemberBodySchema,
  deleteSuccessSchema,
  projectIdParamSchema,
} from "./schema";

export const addProjectMemberRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "addQianlaiProjectMember",
    method: "post",
    path: "/ledgers/{ledgerId}/projects/{projectId}/members",
    tags: ["QianlaiProject"],
    summary: "Add a ledger member to the project (editor+)",
    description:
      "Adds an existing member of the ledger to the project. Outsiders join via a project share code (guest role).",
    request: {
      params: projectIdParamSchema,
      body: {
        content: {
          "application/json": { schema: addProjectMemberBodySchema },
        },
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      ...createdResponseFn(deleteSuccessSchema, "Addition confirmed"),
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
    await addProjectMember(userId, projectId, body.userId);
    return c.json({ success: true as const }, 201);
  },
});
