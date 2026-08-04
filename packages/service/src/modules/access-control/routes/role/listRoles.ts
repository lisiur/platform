import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { listRoles as listRolesService } from "#modules/access-control/role.service";
import { listRolesQuerySchema, listRolesResponseSchema } from "./schema";

export const listRoles = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listRoles",
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
      ...okResponseFn(listRolesResponseSchema, "List of roles"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/role:list");
    const { scopePrefix, limit, offset } = c.req.valid("query");
    const result = await listRolesService(scopePrefix, limit, offset);
    return c.json(result, 200);
  },
});
