import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { listRealAccounts } from "../../real-account.service";
import { listRealAccountsResponseSchema } from "./schema";

export const listRealAccountsRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listQianlaiRealAccounts",
    method: "get",
    path: "/real-accounts",
    tags: ["QianlaiRealAccount"],
    summary: "List the caller's real accounts with cross-ledger balances",
    description:
      "Owner-private net-worth view. Pockets are limited to ledgers the caller is currently a member of; members of those ledgers never see this data.",
    request: {},
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(
        listRealAccountsResponseSchema,
        "Real accounts with pockets and totals",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const result = await listRealAccounts(userId);
    return c.json(result, 200);
  },
});
