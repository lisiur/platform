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
import { createAccount } from "../../account.service";
import {
  bookAccountSchema,
  createAccountBodySchema,
  ledgerIdParamSchema,
  serializeAccount,
} from "./schema";

export const createAccountRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "createQianlaiAccount",
    method: "post",
    path: "/ledgers/{ledgerId}/accounts",
    tags: ["QianlaiAccount"],
    summary: "Create an account (editor+)",
    request: {
      params: ledgerIdParamSchema,
      body: {
        content: {
          "application/json": { schema: createAccountBodySchema },
        },
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      ...conflictResponse,
      ...createdResponseFn(bookAccountSchema, "The created account"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId } = c.req.valid("param");
    const body = c.req.valid("json");
    const access = await requireLedgerAccess(userId, ledgerId, "editor");
    assertLedgerWritable(access.ledger);
    const account = await createAccount(userId, ledgerId, body);
    return c.json(serializeAccount(account), 201);
  },
});
