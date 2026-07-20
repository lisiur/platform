import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { prisma } from "#lib/db";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { getOrgOwnerUserIds } from "#lib/org-role";
import { batchUpdateMembers } from "#services/member.service";
import { assertAccess } from "#services/role-permission.service";
import {
  batchUpdateMembersBodySchema,
  memberSchema,
  orgIdParamSchema,
} from "./schema";

const batchUpdateMembersResponseSchema = memberSchema
  .array()
  .openapi("BatchUpdateMembersResponse");

export const batchUpdateOrganizationMembers = defineOpenAPIRoute({
  route: createRoute({
    method: "patch",
    path: "/{orgId}/members/batch",
    tags: ["Organization Member"],
    summary: "Batch update members",
    description: "Update department assignment for multiple members at once.",
    request: {
      params: orgIdParamSchema,
      body: {
        content: {
          "application/json": { schema: batchUpdateMembersBodySchema },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...badRequestResponse,
      ...okResponseFn(batchUpdateMembersResponseSchema, "Updated members"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const { orgId } = c.req.valid("param");
    const { memberIds, departmentId } = c.req.valid("json");

    await assertAccess(principal, "organization-member::update", {
      appId: "organization",
      organizationId: orgId,
    });

    await batchUpdateMembers(orgId, memberIds, { departmentId });

    const ownerUserIds = await getOrgOwnerUserIds(orgId);

    const members = await prisma.member.findMany({
      where: { id: { in: memberIds } },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        department: { select: { id: true, name: true } },
      },
    });

    logAudit({
      event: "members.batch_updated",
      category: "member",
      metadata: { memberIds, departmentId },
      c,
    });

    return c.json(
      members.map((m) => ({
        ...m,
        role: ownerUserIds.has(m.userId) ? "owner" : "member",
      })),
      200,
    );
  },
});
