import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireSession } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { listDepartments } from "#services/department.service";
import { assertPermission } from "#services/role-permission.service";
import { listDepartmentsResponseSchema, orgIdParamSchema } from "./schema";

export const listDepartmentsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/organizations/{orgId}/departments",
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
    const session = await requireSession(c);
    const { orgId } = c.req.valid("param");

    await assertPermission(session.user.id, "department::list", {
      appId: "organization",
      organizationId: orgId,
    });

    const departments = await listDepartments(orgId);
    return c.json({ departments }, 200);
  },
});
