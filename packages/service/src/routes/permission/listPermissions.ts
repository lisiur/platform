import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { listPermissions } from "#services/permission.service";
import { assertAccess } from "#services/role-permission.service";
import {
  listPermissionsQuerySchema,
  listPermissionsResponseSchema,
} from "./schema";

export const listPermissionsRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listPermissions",
    method: "get",
    path: "/",
    tags: ["Permission"],
    summary: "List permissions",
    description: "Returns all permissions.",
    request: {
      query: listPermissionsQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(
        listPermissionsResponseSchema,
        "Permissions for the application",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/permission:list");
    const { search, sort, sortDir, limit, offset } = c.req.valid("query");
    const result = await listPermissions({
      search,
      sort,
      sortDir,
      limit,
      offset,
      scopePrefix: "system",
    });
    return c.json(result, 200);
  },
});
