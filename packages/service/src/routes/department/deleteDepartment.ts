import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  deleteSuccessSchema,
  forbiddenResponse,
  notFoundResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { deleteDepartment } from "#services/department.service";
import { assertAccess } from "#services/role-permission.service";
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
    const principal = await requirePrincipal(c);
    const { orgId, id } = c.req.valid("param");

    await assertAccess(principal, "department::delete", {
      appId: "organization",
      organizationId: orgId,
    });

    const _department = await deleteDepartment(orgId, id);

    logAudit({
      event: "department.deleted",
      category: "department",
      c,
    });

    return c.json({ success: true } as const, 200);
  },
});
