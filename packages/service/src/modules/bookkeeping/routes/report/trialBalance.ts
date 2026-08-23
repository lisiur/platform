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
import { ledgerIdParamSchema, trialBalanceResponseSchema } from "./schema";

export const trialBalanceRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getQianlaiTrialBalance",
    method: "get",
    path: "/ledgers/{ledgerId}/reports/trial-balance",
    tags: ["QianlaiReport"],
    summary: "Trial balance of the ledger",
    request: {
      params: ledgerIdParamSchema,
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
    await requireLedgerAccess(userId, ledgerId, "viewer");
    return c.json(await trialBalance(ledgerId), 200);
  },
});
