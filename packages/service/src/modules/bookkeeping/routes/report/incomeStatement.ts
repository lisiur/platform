import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireLedgerAccess } from "../../access";
import { incomeStatement } from "../../report.service";
import {
  incomeStatementQuerySchema,
  incomeStatementResponseSchema,
  ledgerIdParamSchema,
} from "./schema";

export const incomeStatementRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getQianlaiIncomeStatement",
    method: "get",
    path: "/ledgers/{ledgerId}/reports/income-statement",
    tags: ["QianlaiReport"],
    summary: "Income statement for a period",
    description:
      "The viewer's income vs expense for the period, share-based: each entry counts at the viewer's participant share (equal split across tagged participants; guest-created entries count through the viewer's share), and the viewer's own untagged entries count in full.",
    request: {
      params: ledgerIdParamSchema,
      query: incomeStatementQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(
        incomeStatementResponseSchema,
        "Income vs expense for the period",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId } = c.req.valid("param");
    const { from, to } = c.req.valid("query");
    await requireLedgerAccess(userId, ledgerId, "viewer");
    return c.json(await incomeStatement(userId, ledgerId, { from, to }), 200);
  },
});
