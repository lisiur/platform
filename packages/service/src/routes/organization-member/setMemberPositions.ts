import { createRoute, defineOpenAPIRoute, z } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { setMemberPositions } from "#services/position.service";
import { assertAccess } from "#services/role-permission.service";
import {
  errorSchema,
  memberIdParamSchema,
  orgIdParamSchema,
  setMemberPositionsBodySchema,
} from "./schema";

export const setMemberPositionsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "put",
    path: "/{orgId}/members/{memberId}/positions",
    tags: ["Organization Member"],
    summary: "Set member positions",
    description: "Replace all positions for a member in an organization.",
    request: {
      params: orgIdParamSchema.merge(memberIdParamSchema),
      body: {
        content: {
          "application/json": {
            schema: setMemberPositionsBodySchema,
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
        description: "Invalid position IDs",
      },
      ...okResponseFn(
        z
          .object({
            id: z.string(),
            position: z.object({
              id: z.string(),
              name: z.string(),
              code: z.string(),
            }),
            createdAt: z.date(),
          })
          .array(),
        "The member's positions",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const { orgId, memberId } = c.req.valid("param");
    const body = c.req.valid("json");

    await assertAccess(principal, "organization-member::update", {
      appId: "organization",
      organizationId: orgId,
    });

    const result = await setMemberPositions(orgId, memberId, body.positionIds);

    logAudit({
      event: "member.positions.updated",
      category: "position",
      c,
    });

    return c.json(result, 200);
  },
});
