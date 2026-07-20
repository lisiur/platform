import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  createdResponseFn,
  forbiddenResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { createPosition } from "#services/position.service";
import { assertAccess } from "#services/role-permission.service";
import {
  createPositionBodySchema,
  errorSchema,
  orgIdParamSchema,
  positionSchema,
} from "./schema";

export const createPositionRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/{orgId}/positions",
    tags: ["Position"],
    summary: "Create a position",
    description: "Create a new position in an organization.",
    request: {
      params: orgIdParamSchema,
      body: {
        content: {
          "application/json": {
            schema: createPositionBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...badRequestResponse,
      409: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Code already taken",
      },
      ...createdResponseFn(positionSchema, "The created position"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const { orgId } = c.req.valid("param");
    const body = c.req.valid("json");

    await assertAccess(principal, "position::create", {
      appId: "organization",
      organizationId: orgId,
    });

    const position = await createPosition(orgId, body);

    logAudit({
      event: "position.created",
      category: "position",
      c,
    });

    return c.json(position, 201);
  },
});
