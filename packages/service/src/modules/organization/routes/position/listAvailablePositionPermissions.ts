import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { orgScope } from "#lib/scope";
import { assertAccess } from "#modules/access-control/public";
import { listAvailablePositionPermissions } from "#modules/organization/position.service";
import {
  orgIdParamSchema,
  positionAvailablePermissionsQuerySchema,
  positionAvailablePermissionsResponseSchema,
  positionIdParamSchema,
} from "./schema";

export const listAvailablePositionPermissionsRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listAvailablePositionPermissions",
    method: "get",
    path: "/{orgId}/positions/{id}/available-permissions",
    tags: ["Position"],
    summary: "List available permissions for a position",
    description:
      "Returns a paginated list of organization permissions available to assign to a position.",
    request: {
      params: orgIdParamSchema.merge(positionIdParamSchema),
      query: positionAvailablePermissionsQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(
        positionAvailablePermissionsResponseSchema,
        "Paginated available permissions",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const { orgId, id } = c.req.valid("param");
    const { search, sort, sortDir, limit, offset } = c.req.valid("query");

    await assertAccess(
      principal,
      "org/position-permission:manage",
      orgScope(orgId),
    );

    const result = await listAvailablePositionPermissions(orgId, id, {
      search,
      sort,
      sortDir,
      limit,
      offset,
    });
    return c.json(result, 200);
  },
});
