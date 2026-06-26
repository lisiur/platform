import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireSession } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { listMembers } from "#services/member.service";
import { assertPermission } from "#services/role-permission.service";
import {
  listMembersQuerySchema,
  listMembersResponseSchema,
  orgIdParamSchema,
} from "./schema";

export const listOrganizationMembers = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/{id}/members",
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
    const session = await requireSession(c);
    const { id } = c.req.valid("param");
    const query = c.req.valid("query");

    await assertPermission(session.user.id, "organization-member::list", {
      appId: "organization",
      organizationId: id,
    });

    const result = await listMembers(id, {
      limit: query.limit,
      offset: query.offset,
      departmentId: query.departmentId ?? undefined,
    });
    return c.json(result, 200);
  },
});
