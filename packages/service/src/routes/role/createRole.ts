import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  createdResponseFn,
  forbiddenResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { createRole as createRoleService } from "#services/role.service";
import { assertAccess } from "#services/role-permission.service";
import { createRoleBodySchema, roleSchema } from "./schema";

export const createRole = defineOpenAPIRoute({
  route: createRoute({
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
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "role::create");
    const { appId, organizationId, name, code } = c.req.valid("json");
    const role = await createRoleService({ appId, organizationId, name, code });

    logAudit({
      event: "role.created",
      category: "role",
      c,
    });

    return c.json(role, 201);
  },
});
