import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  conflictResponse,
  createdResponseFn,
  forbiddenResponse,
  notFoundResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertLedgerWritable, requireLedgerAccess } from "../../access";
import { setAccountBalance } from "../../balance.service";
import { normalizeSeedLocale } from "../../domain";
import { serializeEntry } from "../journal-entry/schema";
import {
  accountIdParamSchema,
  setBalanceBodySchema,
  setBalanceResponseSchema,
} from "./schema";

export const setBalanceRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "setQianlaiAccountBalance",
    method: "post",
    path: "/ledgers/{ledgerId}/accounts/{id}/balance",
    tags: ["QianlaiAccount"],
    summary: "Set an account's balance as of a date (editor+)",
    description:
      "Posts a balanced adjustment entry against the system equity account so the account's balance as of `date` equals `balance`. Entries dated after `date` are left untouched. Only asset and liability accounts are adjustable.",
    request: {
      params: accountIdParamSchema,
      body: {
        content: {
          "application/json": { schema: setBalanceBodySchema },
        },
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      ...conflictResponse,
      ...createdResponseFn(
        setBalanceResponseSchema,
        "The adjustment result (entry is null when already at the target balance)",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId, id } = c.req.valid("param");
    const body = c.req.valid("json");
    const access = await requireLedgerAccess(userId, ledgerId, "editor");
    assertLedgerWritable(access.ledger);
    // Entries live at UTC midnight; the as-of day must land there too.
    const date = body.date
      ? new Date(`${body.date}T00:00:00.000Z`)
      : todayUtcMidnight();
    const locale = normalizeSeedLocale(c.req.header("accept-language"));
    const result = await setAccountBalance(
      userId,
      ledgerId,
      id,
      { balance: body.balance, date, memo: body.memo },
      locale,
    );
    return c.json(
      {
        adjusted: result.adjusted,
        entry: result.entry ? serializeEntry(result.entry) : null,
      },
      201,
    );
  },
});

function todayUtcMidnight(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}
