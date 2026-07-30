import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { forbiddenResponse, unauthorizedResponse } from "#lib/openapi";
import { orgScope } from "#lib/scope";
import { listPositions } from "#services/position.service";
import { assertAccess } from "#services/role-permission.service";
import { listPositionsResponseSchema, orgIdParamSchema } from "./schema";

export const listPositionsRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listPositions",
    method: "get",
    path: "/{orgId}/positions",
    tags: ["Position"],
    summary: "List positions",
    description: "List all positions in an organization.",
    request: {
      params: orgIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      200: {
        content: {
          "application/json": { schema: listPositionsResponseSchema },
        },
        description: "List of positions",
      },
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const { orgId } = c.req.valid("param");

    await assertAccess(principal, "org/position:list", orgScope(orgId));

    const positions = await listPositions(orgId);

    return c.json({ positions }, 200);
  },
});
