import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { listRoles as listRolesService } from "#services/role.service";
import { assertAccess } from "#services/role-permission.service";
import { listRolesQuerySchema, roleSchema } from "./schema";

export const listRoles = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/",
    tags: ["Role"],
    summary: "List roles for a scope",
    request: {
      query: listRolesQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(roleSchema.array(), "List of roles"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/role:list");
    const { scopePrefix } = c.req.valid("query");
    const roles = await listRolesService(scopePrefix);
    return c.json(roles, 200);
  },
});
