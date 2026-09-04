import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  createdResponseFn,
  forbiddenResponse,
  notFoundResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireLedgerAccess } from "../../access";
import { createVirtualMember } from "../../share.service";
import {
  createVirtualMemberBodySchema,
  ledgerIdParamSchema,
  ledgerMemberSchema,
} from "./schema";

export const createVirtualMemberRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "createQianlaiVirtualMember",
    method: "post",
    path: "/ledgers/{ledgerId}/members",
    tags: ["QianlaiShare"],
    summary: "Add a virtual member (editor+)",
    description:
      "Adds a ledger member directly, without an invitation or registration — for people who will never install the app (children, etc.). Creates a flag-marked User row with no email and no way to sign in, plus a viewer membership, so entries can name it as payer/participant and settlement charges it like any member.",
    request: {
      params: ledgerIdParamSchema,
      body: {
        content: {
          "application/json": { schema: createVirtualMemberBodySchema },
        },
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...createdResponseFn(ledgerMemberSchema, "The created virtual member"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId } = c.req.valid("param");
    await requireLedgerAccess(userId, ledgerId, "editor");
    const { name } = c.req.valid("json");
    return c.json(await createVirtualMember(ledgerId, userId, name), 201);
  },
});
