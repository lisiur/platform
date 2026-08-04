import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { orgScope } from "#lib/scope";
import { assertAccess } from "#modules/access-control/public";
import { listDepartments } from "#modules/organization/department.service";
import { listDepartmentsResponseSchema, orgIdParamSchema } from "./schema";

export const listDepartmentsRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listDepartments",
    method: "get",
    path: "/{orgId}/departments",
    tags: ["Department"],
    summary: "List departments",
    description: "Returns all departments for an organization.",
    request: {
      params: orgIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(listDepartmentsResponseSchema, "List of departments"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const { orgId } = c.req.valid("param");

    await assertAccess(principal, "org/department:list", orgScope(orgId));

    const departments = await listDepartments(orgId);
    return c.json(
      {
        departments: departments.map((d) => ({
          ...d,
          childrenCount: d._count.children,
        })),
      },
      200,
    );
  },
});
