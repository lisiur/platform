import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  conflictResponse,
  deleteSuccessSchema,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertLedgerWritable, requireLedgerAccess } from "../../access";
import { deleteAccount } from "../../account.service";
import { accountIdParamSchema } from "./schema";

export const deleteAccountRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "deleteQianlaiAccount",
    method: "delete",
    path: "/ledgers/{ledgerId}/accounts/{id}",
    tags: ["QianlaiAccount"],
    summary: "Delete an account (editor+)",
    description:
      "Only accounts without journal lines can be deleted; archive accounts that have history.",
    request: {
      params: accountIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      ...conflictResponse,
      ...okResponseFn(deleteSuccessSchema, "Deletion confirmed"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId, id } = c.req.valid("param");
    const access = await requireLedgerAccess(userId, ledgerId, "editor");
    assertLedgerWritable(access.ledger);
    return c.json(await deleteAccount(ledgerId, id), 200);
  },
});
