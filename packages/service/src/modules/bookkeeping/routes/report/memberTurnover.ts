import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireLedgerAccess } from "../../access";
import { memberTurnover } from "../../report.service";
import {
  ledgerIdParamSchema,
  memberTurnoverQuerySchema,
  memberTurnoverResponseSchema,
} from "./schema";

export const memberTurnoverRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getQianlaiMemberTurnover",
    method: "get",
    path: "/ledgers/{ledgerId}/reports/member-turnover",
    tags: ["QianlaiReport"],
    summary: "Per-member turnover of the ledger",
    description:
      "Gross amount of every entry each member is tagged on, summed over the optional [from, to] window. An entry tagged with several members counts in full for each of them. All current members are returned, zero turnover included.",
    request: {
      params: ledgerIdParamSchema,
      query: memberTurnoverQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(
        memberTurnoverResponseSchema,
        "Per-member turnover with entry counts",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId } = c.req.valid("param");
    const { from, to } = c.req.valid("query");
    await requireLedgerAccess(userId, ledgerId, "viewer");
    return c.json(await memberTurnover(ledgerId, { from, to }), 200);
  },
});
