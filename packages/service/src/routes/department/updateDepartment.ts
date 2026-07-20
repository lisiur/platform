import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { updateDepartment } from "#services/department.service";
import { assertAccess } from "#services/role-permission.service";
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
    path: "/{orgId}/departments/{id}",
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
      ...badRequestResponse,
      ...notFoundResponse,
      409: {
        content: { "application/json": { schema: errorSchema } },
        description: "Code already taken",
      },
      ...okResponseFn(departmentSchema, "The updated department"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const { orgId, id } = c.req.valid("param");
    const body = c.req.valid("json");

    await assertAccess(principal, "department::update", {
      appId: "organization",
      organizationId: orgId,
    });

    const department = await updateDepartment(orgId, id, body);

    logAudit({
      event: "department.updated",
      category: "department",
      c,
    });

    return c.json(
      { ...department, childrenCount: department._count.children },
      200,
    );
  },
});
