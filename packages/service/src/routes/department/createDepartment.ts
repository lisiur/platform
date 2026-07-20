import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  createdResponseFn,
  forbiddenResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { createDepartment } from "#services/department.service";
import { assertAccess } from "#services/role-permission.service";
import {
  createDepartmentBodySchema,
  departmentSchema,
  errorSchema,
  orgIdParamSchema,
} from "./schema";

export const createDepartmentRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/{orgId}/departments",
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
      ...badRequestResponse,
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
    const principal = await requirePrincipal(c);
    const { orgId } = c.req.valid("param");
    const body = c.req.valid("json");

    await assertAccess(principal, "department::create", {
      appId: "organization",
      organizationId: orgId,
    });

    const department = await createDepartment(orgId, body);

    logAudit({
      event: "department.created",
      category: "department",
      c,
    });

    return c.json(
      { ...department, childrenCount: department._count.children },
      201,
    );
  },
});
