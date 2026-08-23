import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { createdResponseFn, unauthorizedResponse } from "#lib/openapi";
import { createLedger } from "../../ledger.service";
import { createLedgerBodySchema, ledgerSchema } from "./schema";

export const createLedgerRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "createQianlaiLedger",
    method: "post",
    path: "/ledgers",
    tags: ["QianlaiLedger"],
    summary: "Create a ledger",
    description:
      "Creates a ledger owned by the caller and seeds a starter chart of accounts (unless seedStarterAccounts is false).",
    request: {
      body: {
        content: {
          "application/json": { schema: createLedgerBodySchema },
        },
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...createdResponseFn(ledgerSchema, "The created ledger"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const body = c.req.valid("json");
    const ledger = await createLedger(userId, body);
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
        myRole: "owner" as const,
        membersCount: 1,
        shared: false,
      },
      201,
    );
  },
});
