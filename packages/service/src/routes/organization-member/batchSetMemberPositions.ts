import { createRoute, defineOpenAPIRoute, z } from "@hono/zod-openapi";
import { requireSession } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { batchSetMemberPositions } from "#services/position.service";
import { assertPermission } from "#services/role-permission.service";
import {
  batchSetMemberPositionsBodySchema,
  errorSchema,
  orgIdParamSchema,
} from "./schema";

export const batchSetMemberPositionsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "put",
    path: "/{id}/members/positions/batch",
    tags: ["Organization Member"],
    summary: "Batch set member positions",
    description:
      "Replace all positions for multiple members in an organization.",
    request: {
      params: orgIdParamSchema,
      body: {
        content: {
          "application/json": {
            schema: batchSetMemberPositionsBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      400: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Invalid member or position IDs",
      },
      ...okResponseFn(
        z.object({ success: z.boolean() }),
        "Batch update result",
      ),
    },
  }),
  handler: async (c) => {
    const session = await requireSession(c);
    const { id: orgId } = c.req.valid("param");
    const body = c.req.valid("json");

    await assertPermission(session.user.id, "organization-member::update", {
      appId: "organization",
      organizationId: orgId,
    });

    await batchSetMemberPositions(orgId, body.memberIds, body.positionIds);

    logAudit({
      event: "member.positions.batch-updated",
      category: "position",
      targetType: "member",
      targetId: body.memberIds.join(","),
      c,
    });

    return c.json({ success: true }, 200);
  },
});
