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
import { ledgerIdParamSchema, listAccountsResponseSchema } from "./schema";

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
    await requireLedgerAccess(userId, ledgerId, "viewer");
    const { accounts } = await listAccounts(ledgerId);
    return c.json(
      {
        accounts: accounts.map((account) => ({
          ...account,
          type: account.type as
            | "asset"
            | "liability"
            | "equity"
            | "income"
            | "expense",
          status: account.status as "active" | "archived",
        })),
      },
      200,
    );
  },
});
