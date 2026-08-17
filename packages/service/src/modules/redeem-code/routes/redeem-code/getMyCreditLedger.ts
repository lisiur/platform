import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { okResponseFn, unauthorizedResponse } from "#lib/openapi";
import { listUserCreditLedger as listUserCreditLedgerService } from "#modules/redeem-code/redeem-code.service";
import {
  listRedeemCodesQuerySchema,
  listUserCreditLedgerResponseSchema,
} from "./schema";

export const getMyCreditLedger = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getMyCreditLedger",
    method: "get",
    path: "/me/credit/ledger",
    tags: ["RedeemCode"],
    summary: "List current user's credit ledger entries",
    request: {
      query: listRedeemCodesQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...okResponseFn(
        listUserCreditLedgerResponseSchema,
        "List of current user's credit ledger entries",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { limit, offset } = c.req.valid("query");
    const result = await listUserCreditLedgerService(userId, limit, offset);
    return c.json(result, 200);
  },
});
