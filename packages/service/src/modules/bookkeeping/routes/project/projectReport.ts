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
import { projectReport } from "../../project.service";
import { projectIdParamSchema, projectReportResponseSchema } from "./schema";

export const projectReportRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getQianlaiProjectReport",
    method: "get",
    path: "/ledgers/{ledgerId}/projects/{projectId}/report",
    tags: ["QianlaiProject"],
    summary: "Project income/expense summary and equal-split settlement",
    description:
      "The project page report: an income/expense statement over the project's entries plus a settlement suggestion. Entries tagged with participants split across exactly those people; untagged entries split across all project members. Per member: paid (what they fronted) minus share (their fair part) — positive balance means they are owed.",
    request: {
      params: projectIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(projectReportResponseSchema, "The project report"),
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
    return c.json(await projectReport(userId, projectId), 200);
  },
});
