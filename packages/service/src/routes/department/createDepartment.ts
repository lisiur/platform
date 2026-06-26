import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireSession } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  createdResponseFn,
  forbiddenResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { createDepartment } from "#services/department.service";
import { assertPermission } from "#services/role-permission.service";
import {
  createDepartmentBodySchema,
  departmentSchema,
  errorSchema,
  orgIdParamSchema,
} from "./schema";

export const createDepartmentRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/organizations/{orgId}/departments",
    tags: ["Department"],
    summary: "Create a department",
    description: "Create a new department in an organization.",
    request: {
      params: orgIdParamSchema,
      body: {
        content: {
          "application/json": {
            schema: createDepartmentBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      409: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Code already taken",
      },
      ...createdResponseFn(departmentSchema, "The created department"),
    },
  }),
  handler: async (c) => {
    const session = await requireSession(c);
    const { orgId } = c.req.valid("param");
    const body = c.req.valid("json");

    await assertPermission(session.user.id, "department::create", {
      appId: "organization",
      organizationId: orgId,
    });

    const department = await createDepartment(orgId, body);

    logAudit({
      event: "department.created",
      category: "department",
      targetId: department.id,
      targetName: department.name,
      c,
    });

    return c.json(department, 201);
  },
});
