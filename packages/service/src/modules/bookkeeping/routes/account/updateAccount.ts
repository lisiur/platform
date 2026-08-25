import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  conflictResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertLedgerWritable, requireLedgerAccess } from "../../access";
import { updateAccount } from "../../account.service";
import {
  accountIdParamSchema,
  bookAccountSchema,
  serializeAccount,
  updateAccountBodySchema,
} from "./schema";

export const updateAccountRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "updateQianlaiAccount",
    method: "patch",
    path: "/ledgers/{ledgerId}/accounts/{id}",
    tags: ["QianlaiAccount"],
    summary: "Update an account (editor+)",
    description:
      'Use status "archived" to retire an account that still has journal lines.',
    request: {
      params: accountIdParamSchema,
      body: {
        content: {
          "application/json": { schema: updateAccountBodySchema },
        },
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      ...conflictResponse,
      ...okResponseFn(bookAccountSchema, "The updated account"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId, id } = c.req.valid("param");
    const body = c.req.valid("json");
    const access = await requireLedgerAccess(userId, ledgerId, "editor");
    assertLedgerWritable(access.ledger);
    const account = await updateAccount(userId, ledgerId, id, body);
    return c.json(serializeAccount(account), 200);
  },
});
