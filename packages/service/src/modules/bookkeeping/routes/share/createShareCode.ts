import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  createdResponseFn,
  forbiddenResponse,
  notFoundResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertLedgerWritable, requireLedgerAccess } from "../../access";
import { createShareCode } from "../../share.service";
import {
  createShareCodeBodySchema,
  ledgerIdParamSchema,
  shareCodeSchema,
} from "./schema";

export const createShareCodeRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "createQianlaiShareCode",
    method: "post",
    path: "/ledgers/{ledgerId}/share-codes",
    tags: ["QianlaiShare"],
    summary: "Create a share code (owner only)",
    description:
      "Any registered user can redeem the code to join this ledger with the bound role.",
    request: {
      params: ledgerIdParamSchema,
      body: {
        content: {
          "application/json": { schema: createShareCodeBodySchema },
        },
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...createdResponseFn(shareCodeSchema, "The created share code"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId } = c.req.valid("param");
    const body = c.req.valid("json");
    const access = await requireLedgerAccess(userId, ledgerId, "owner");
    assertLedgerWritable(access.ledger);
    const code = await createShareCode(ledgerId, userId, body);
    return c.json(
      {
        ...code,
        role: code.role as "editor" | "viewer",
        status: code.status as "active" | "revoked",
      },
      201,
    );
  },
});
