import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireSession } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { updateDepartment } from "#services/department.service";
import { assertPermission } from "#services/role-permission.service";
import {
  departmentIdParamSchema,
  departmentSchema,
  errorSchema,
  orgIdParamSchema,
  updateDepartmentBodySchema,
} from "./schema";

export const updateDepartmentRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "put",
    path: "/organizations/{orgId}/departments/{id}",
    tags: ["Department"],
    summary: "Update a department",
    request: {
      params: orgIdParamSchema.merge(departmentIdParamSchema),
      body: {
        content: {
          "application/json": { schema: updateDepartmentBodySchema },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      409: {
        content: { "application/json": { schema: errorSchema } },
        description: "Code already taken",
      },
      ...okResponseFn(departmentSchema, "The updated department"),
    },
  }),
  handler: async (c) => {
    const session = await requireSession(c);
    const { orgId, id } = c.req.valid("param");
    const body = c.req.valid("json");

    await assertPermission(session.user.id, "department::update", {
      appId: "organization",
      organizationId: orgId,
    });

    const department = await updateDepartment(orgId, id, body);

    logAudit({
      event: "department.updated",
      category: "department",
      targetId: department.id,
      targetName: department.name,
      c,
    });

    return c.json(department, 200);
  },
});
