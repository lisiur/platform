import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { listUserCreditLedger as listUserCreditLedgerService } from "#modules/redeem-code/redeem-code.service";
import {
  listRedeemCodesQuerySchema,
  listUserCreditLedgerResponseSchema,
  userCreditUserIdParamSchema,
} from "./schema";

export const listUserCreditLedger = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listUserCreditLedger",
    method: "get",
    path: "/credits/{userId}/ledger",
    tags: ["RedeemCode"],
    summary: "List a user's credit ledger entries (admin)",
    request: {
      params: userCreditUserIdParamSchema,
      query: listRedeemCodesQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(
        listUserCreditLedgerResponseSchema,
        "List of user credit ledger entries",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/user-credit:list");
    const { userId } = c.req.valid("param");
    const { limit, offset } = c.req.valid("query");
    const result = await listUserCreditLedgerService(userId, limit, offset);
    return c.json(result, 200);
  },
});
