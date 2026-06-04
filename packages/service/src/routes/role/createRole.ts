import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  createdResponseFn,
  forbiddenResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { createRole as createRoleService } from "#services/role.service";
import { prepend } from "#utils/list";
import { createRoleBodySchema, roleSchema } from "./schema";

export const createRole = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("role::create")),
    method: "post",
    path: "/",
    tags: ["Role"],
    summary: "Create a role",
    request: {
      body: {
        content: {
          "application/json": { schema: createRoleBodySchema },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...badRequestResponse,
      ...createdResponseFn(roleSchema, "Created role"),
    },
  }),
  handler: async (c) => {
    const data = c.req.valid("json");
    const role = await createRoleService(data);

    logAudit({
      event: "role.created",
      category: "role",
      targetId: role.id,
      targetName: role.name,
      c,
    });

    return c.json(role, 201);
  },
});
