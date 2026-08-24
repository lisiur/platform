import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireLedgerAccess } from "../../access";
import { trialBalance } from "../../report.service";
import {
  ledgerIdParamSchema,
  trialBalanceQuerySchema,
  trialBalanceResponseSchema,
} from "./schema";

export const trialBalanceRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getQianlaiTrialBalance",
    method: "get",
    path: "/ledgers/{ledgerId}/reports/trial-balance",
    tags: ["QianlaiReport"],
    summary: "Trial balance of the ledger",
    description:
      "Per-account debit/credit totals. With `to`, only entries dated on or before that day are summed (matches the base the set-balance adjustment corrects).",
    request: {
      params: ledgerIdParamSchema,
      query: trialBalanceQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(
        trialBalanceResponseSchema,
        "Per-account debit/credit totals",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId } = c.req.valid("param");
    const { to } = c.req.valid("query");
    await requireLedgerAccess(userId, ledgerId, "viewer");
    return c.json(await trialBalance(ledgerId, { to }), 200);
  },
});
