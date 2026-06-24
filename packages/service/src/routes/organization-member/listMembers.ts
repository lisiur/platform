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
  organizationIdParamSchema,
} from "./schema";

export const listOrganizationMembers = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/{id}/members",
    tags: ["Organization"],
    summary: "List members of an organization",
    description:
      "Returns a paginated list of members for the given organization.",
    request: {
      params: organizationIdParamSchema,
      query: listMembersQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(listMembersResponseSchema, "Paginated list of members"),
    },
  }),
  handler: async (c) => {
    const session = await requireSession(c);
    const { id } = c.req.valid("param");
    const { limit, offset } = c.req.valid("query");

    await assertPermission(session.user.id, "organization-member::list", {
      appId: "organization",
      organizationId: id,
    });

    const result = await listMembers(id, { limit, offset });
    return c.json(result, 200);
  },
});
