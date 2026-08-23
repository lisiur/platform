import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireLedgerAccess } from "../../access";
import { listShareCodes } from "../../share.service";
import { ledgerIdParamSchema, listShareCodesResponseSchema } from "./schema";

export const listShareCodesRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listQianlaiShareCodes",
    method: "get",
    path: "/ledgers/{ledgerId}/share-codes",
    tags: ["QianlaiShare"],
    summary: "List share codes (owner only)",
    request: {
      params: ledgerIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(
        listShareCodesResponseSchema,
        "Share codes of the ledger",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId } = c.req.valid("param");
    await requireLedgerAccess(userId, ledgerId, "owner");
    const { codes } = await listShareCodes(ledgerId);
    return c.json(
      {
        codes: codes.map((code) => ({
          ...code,
          role: code.role as "editor" | "viewer",
          status: code.status as "active" | "revoked",
        })),
      },
      200,
    );
  },
});
