import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { orgScope } from "#lib/scope";
import { getDepartment } from "#services/department.service";
import { assertAccess } from "#services/role-permission.service";
import {
  departmentIdParamSchema,
  departmentSchema,
  orgIdParamSchema,
} from "./schema";

export const getDepartmentRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/{orgId}/departments/{id}",
    tags: ["Department"],
    summary: "Get a department",
    request: {
      params: orgIdParamSchema.merge(departmentIdParamSchema),
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(departmentSchema, "The department"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const { orgId, id } = c.req.valid("param");

    await assertAccess(principal, "org/department:list", orgScope(orgId));

    const department = await getDepartment(orgId, id);
    return c.json(
      { ...department, childrenCount: department._count.children },
      200,
    );
  },
});
