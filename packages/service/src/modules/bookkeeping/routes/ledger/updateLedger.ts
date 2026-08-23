import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  forbiddenResponse,
  idParamSchema,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireLedgerAccess } from "../../access";
import { updateLedger } from "../../ledger.service";
import { ledgerDetailSchema, updateLedgerBodySchema } from "./schema";

export const updateLedgerRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "updateQianlaiLedger",
    method: "patch",
    path: "/ledgers/{id}",
    tags: ["QianlaiLedger"],
    summary: "Update a ledger (owner only)",
    request: {
      params: idParamSchema(),
      body: {
        content: {
          "application/json": { schema: updateLedgerBodySchema },
        },
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      ...okResponseFn(ledgerDetailSchema, "The updated ledger"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    await requireLedgerAccess(userId, id, "owner");
    const ledger = await updateLedger(userId, id, body);
    return c.json(
      {
        id: ledger.id,
        ownerId: ledger.ownerId,
        name: ledger.name,
        description: ledger.description,
        currency: ledger.currency,
        status: ledger.status as "active" | "archived",
        isDefault: ledger.isDefault,
        createdAt: ledger.createdAt,
        updatedAt: ledger.updatedAt,
      },
      200,
    );
  },
});
