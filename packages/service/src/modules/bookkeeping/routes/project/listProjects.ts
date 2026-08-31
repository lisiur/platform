import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireLedgerAccess } from "../../access";
import { listProjects } from "../../project.service";
import { ledgerIdParamSchema, listProjectsResponseSchema } from "./schema";

export const listProjectsRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listQianlaiProjects",
    method: "get",
    path: "/ledgers/{ledgerId}/projects",
    tags: ["QianlaiProject"],
    summary: "List the ledger's projects",
    description:
      "Full roles see every project; guests only see the projects they belong to.",
    request: {
      params: ledgerIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(listProjectsResponseSchema, "Projects of the ledger"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId } = c.req.valid("param");
    const access = await requireLedgerAccess(userId, ledgerId, "guest");
    const result = await listProjects(userId, ledgerId, access.membership.role);
    return c.json(result, 200);
  },
});
