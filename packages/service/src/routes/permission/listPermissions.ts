import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireSession } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { listPermissionsForApp } from "#services/permission.service";
import { assertPermission } from "#services/role-permission.service";
import {
  listPermissionsQuerySchema,
  listPermissionsResponseSchema,
} from "./schema";

export const listPermissions = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/",
    tags: ["Permission"],
    summary: "List permissions",
    description:
      "Returns all permissions available to an application (app-scoped and platform-wide).",
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
    const session = await requireSession(c);
    await assertPermission(session.user.id, "permission::list");
    const { appId, search, sort, sortDir, limit, offset } =
      c.req.valid("query");
    const result = await listPermissionsForApp(appId, {
      search,
      sort,
      sortDir,
      limit,
      offset,
    });
    return c.json(result, 200);
  },
});
