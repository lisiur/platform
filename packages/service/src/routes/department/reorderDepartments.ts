import { createRoute, defineOpenAPIRoute, z } from "@hono/zod-openapi";
import { requireSession } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { reorderDepartments } from "#services/department.service";
import { assertPermission } from "#services/role-permission.service";
import { orgIdParamSchema, reorderDepartmentsBodySchema } from "./schema";

const reorderResponseSchema = z
  .object({ success: z.boolean() })
  .openapi("ReorderDepartmentsResponse");

export const reorderDepartmentsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "put",
    path: "/organizations/{orgId}/departments/reorder",
    tags: ["Department"],
    summary: "Reorder departments",
    request: {
      params: orgIdParamSchema,
      body: {
        content: {
          "application/json": { schema: reorderDepartmentsBodySchema },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(reorderResponseSchema, "Reorder successful"),
    },
  }),
  handler: async (c) => {
    const session = await requireSession(c);
    const { orgId } = c.req.valid("param");
    const { items } = c.req.valid("json");

    await assertPermission(session.user.id, "department::reorder", {
      appId: "organization",
      organizationId: orgId,
    });

    await reorderDepartments(orgId, items);
    return c.json({ success: true }, 200);
  },
});
