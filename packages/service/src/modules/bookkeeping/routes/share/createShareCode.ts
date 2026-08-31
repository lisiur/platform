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
    summary: "Create a share code (owner; editors for project invites)",
    description:
      'Any registered user can redeem the code to join this ledger with the bound role. With projectId set the code becomes a project invite redeemable for guest access to that project (editors and above may create those; the role field must be "guest").',
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
    // Project invites: editor+. Ledger-wide codes: owner only.
    const access = await requireLedgerAccess(
      userId,
      ledgerId,
      body.projectId ? "editor" : "owner",
    );
    assertLedgerWritable(access.ledger);
    const code = await createShareCode(ledgerId, userId, {
      ...body,
      role: body.projectId ? "guest" : body.role,
    });
    return c.json(
      {
        ...code,
        role: code.role as "editor" | "viewer" | "guest",
        status: code.status as "active" | "revoked",
      },
      201,
    );
  },
});
