import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireLedgerAccess } from "../../access";
import { listAccounts } from "../../account.service";
import {
  ledgerIdParamSchema,
  listAccountsResponseSchema,
  serializeAccount,
} from "./schema";

export const listAccountsRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listQianlaiAccounts",
    method: "get",
    path: "/ledgers/{ledgerId}/accounts",
    tags: ["QianlaiAccount"],
    summary: "List the ledger's chart of accounts",
    request: {
      params: ledgerIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(listAccountsResponseSchema, "Accounts of the ledger"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId } = c.req.valid("param");
    // "guest" = any member; guests get only the expense categories (the
    // account types they may record against — no pockets, no balances).
    const access = await requireLedgerAccess(userId, ledgerId, "guest");
    const { accounts } = await listAccounts(ledgerId);
    const visible =
      access.membership.role === "guest"
        ? accounts.filter((a) => a.type === "expense")
        : accounts;
    return c.json({ accounts: visible.map(serializeAccount) }, 200);
  },
});
