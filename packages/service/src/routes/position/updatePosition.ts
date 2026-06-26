import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireSession } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { updatePosition } from "#services/position.service";
import { assertPermission } from "#services/role-permission.service";
import {
  errorSchema,
  orgIdParamSchema,
  positionIdParamSchema,
  positionSchema,
  updatePositionBodySchema,
} from "./schema";

export const updatePositionRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "put",
    path: "/{orgId}/positions/{id}",
    tags: ["Position"],
    summary: "Update a position",
    description: "Update a position in an organization.",
    request: {
      params: orgIdParamSchema.merge(positionIdParamSchema),
      body: {
        content: {
          "application/json": {
            schema: updatePositionBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...badRequestResponse,
      ...notFoundResponse,
      409: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Code already taken",
      },
      ...okResponseFn(positionSchema, "The updated position"),
    },
  }),
  handler: async (c) => {
    const session = await requireSession(c);
    const { orgId, id } = c.req.valid("param");
    const body = c.req.valid("json");

    await assertPermission(session.user.id, "position::update", {
      appId: "organization",
      organizationId: orgId,
    });

    const position = await updatePosition(orgId, id, body);

    logAudit({
      event: "position.updated",
      category: "position",
      targetType: "position",
      targetId: position.id,
      targetName: position.name,
      c,
    });

    return c.json(position, 200);
  },
});
