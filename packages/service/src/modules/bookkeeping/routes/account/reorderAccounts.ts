import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertLedgerWritable, requireLedgerAccess } from "../../access";
import { reorderAccounts } from "../../account.service";
import {
  ledgerIdParamSchema,
  reorderAccountsBodySchema,
  reorderAccountsResponseSchema,
  serializeAccount,
} from "./schema";

export const reorderAccountsRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "reorderQianlaiAccounts",
    method: "post",
    path: "/ledgers/{ledgerId}/accounts/reorder",
    tags: ["QianlaiAccount"],
    summary: "Reorder accounts (editor+)",
    description:
      "Batch update account positions after drag-and-drop. Recalculates sortOrder for all affected sibling groups atomically.",
    request: {
      params: ledgerIdParamSchema,
      body: {
        content: {
          "application/json": { schema: reorderAccountsBodySchema },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      ...okResponseFn(
        reorderAccountsResponseSchema,
        "All ledger accounts with recalculated sortOrder",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId } = c.req.valid("param");
    const body = c.req.valid("json");
    const access = await requireLedgerAccess(userId, ledgerId, "editor");
    assertLedgerWritable(access.ledger);
    const result = await reorderAccounts(ledgerId, body.items);
    return c.json({ accounts: result.accounts.map(serializeAccount) }, 200);
  },
});
