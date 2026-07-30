import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { orgScope } from "#lib/scope";
import { listMembers } from "#services/member.service";
import { assertAccess } from "#services/role-permission.service";
import {
  listMembersQuerySchema,
  listMembersResponseSchema,
  orgIdParamSchema,
} from "./schema";

export const listOrganizationMembers = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listOrganizationMembers",
    method: "get",
    path: "/{orgId}/members",
    tags: ["Organization Member"],
    summary: "List organization members",
    request: {
      params: orgIdParamSchema,
      query: listMembersQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(listMembersResponseSchema, "List of members"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const { orgId } = c.req.valid("param");
    const query = c.req.valid("query");

    await assertAccess(
      principal,
      "org/organization-member:list",
      orgScope(orgId),
    );

    const result = await listMembers(orgId, {
      limit: query.limit,
      offset: query.offset,
      departmentId: query.departmentId ?? undefined,
    });
    return c.json(result, 200);
  },
});
