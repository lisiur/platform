import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { orgScope } from "#lib/scope";
import { assertAccess } from "#modules/access-control/public";
import { updatePosition } from "#modules/organization/position.service";
import {
  errorSchema,
  orgIdParamSchema,
  positionIdParamSchema,
  positionSchema,
  updatePositionBodySchema,
} from "./schema";

export const updatePositionRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "updatePosition",
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
    const principal = await requirePrincipal(c);
    const { orgId, id } = c.req.valid("param");
    const body = c.req.valid("json");

    await assertAccess(principal, "org/position:update", orgScope(orgId));

    const position = await updatePosition(orgId, id, body);

    logAudit({
      event: "position.updated",
      category: "position",
      c,
    });

    return c.json(position, 200);
  },
});
