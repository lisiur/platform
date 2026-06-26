import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireSession } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  deleteSuccessSchema,
  forbiddenResponse,
  notFoundResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { deleteDepartment } from "#services/department.service";
import { assertPermission } from "#services/role-permission.service";
import { departmentIdParamSchema, orgIdParamSchema } from "./schema";

export const deleteDepartmentRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "delete",
    path: "/{orgId}/departments/{id}",
    tags: ["Department"],
    summary: "Delete a department",
    request: {
      params: orgIdParamSchema.merge(departmentIdParamSchema),
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      200: {
        content: { "application/json": { schema: deleteSuccessSchema } },
        description: "Department deleted",
      },
    },
  }),
  handler: async (c) => {
    const session = await requireSession(c);
    const { orgId, id } = c.req.valid("param");

    await assertPermission(session.user.id, "department::delete", {
      appId: "organization",
      organizationId: orgId,
    });

    const department = await deleteDepartment(orgId, id);

    logAudit({
      event: "department.deleted",
      category: "department",
      targetType: "department",
      targetId: department.id,
      targetName: department.name,
      c,
    });

    return c.json({ success: true } as const, 200);
  },
});
