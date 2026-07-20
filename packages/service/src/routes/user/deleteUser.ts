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
import { assertAccess } from "#services/role-permission.service";
import { deleteUser as deleteUserSvc } from "#services/user.service";
import { successSchema, userIdParamSchema } from "./schema";

export const deleteUser = defineOpenAPIRoute({
  route: createRoute({
    method: "delete",
    path: "/{id}",
    tags: ["AdminUser"],
    summary: "Delete a user",
    request: {
      params: userIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      ...okResponseFn(successSchema, "User deleted"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "user::delete");
    const { id } = c.req.valid("param");
    await deleteUserSvc(id);

    await logAudit({
      event: "user.deleted",
      category: "user",
      c,
    });

    return c.json({ success: true }, 200);
  },
});
