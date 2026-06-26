import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireSession } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { getDepartment } from "#services/department.service";
import { assertPermission } from "#services/role-permission.service";
import {
  departmentIdParamSchema,
  departmentSchema,
  orgIdParamSchema,
} from "./schema";

export const getDepartmentRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/organizations/{orgId}/departments/{id}",
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
    const session = await requireSession(c);
    const { orgId, id } = c.req.valid("param");

    await assertPermission(session.user.id, "department::list", {
      appId: "organization",
      organizationId: orgId,
    });

    const department = await getDepartment(orgId, id);
    return c.json(department, 200);
  },
});
