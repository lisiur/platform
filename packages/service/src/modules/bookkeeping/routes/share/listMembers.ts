import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireLedgerAccess } from "../../access";
import { listMembers } from "../../share.service";
import { ledgerIdParamSchema, listMembersResponseSchema } from "./schema";

export const listMembersRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listQianlaiLedgerMembers",
    method: "get",
    path: "/ledgers/{ledgerId}/members",
    tags: ["QianlaiShare"],
    summary: "List ledger members",
    request: {
      params: ledgerIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(listMembersResponseSchema, "Members of the ledger"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId } = c.req.valid("param");
    // "guest" is the floor: project-scoped members need the roster too (the
    // participants picker), and the service scopes their view down to
    // co-members of their own projects.
    const access = await requireLedgerAccess(userId, ledgerId, "guest");
    const { members } = await listMembers(ledgerId, {
      userId,
      role: access.membership.role,
    });
    return c.json(
      {
        members: members.map((member) => ({
          ...member,
          role: member.role as "owner" | "editor" | "viewer" | "guest",
        })),
      },
      200,
    );
  },
});
