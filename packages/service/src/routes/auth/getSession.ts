import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { okResponseFn } from "#lib/openapi";
import { orgScope, SYSTEM_SCOPE } from "#lib/scope";
import { getSession as getSessionService } from "#services/auth.service";
import { getUserPermissions } from "#services/role-permission.service";
import { sessionResponseSchema } from "./schema";

export const getSession = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/get-session",
    tags: ["Auth"],
    summary: "Get current session",
    responses: {
      ...okResponseFn(sessionResponseSchema, "Current session or null"),
    },
  }),
  handler: async (c) => {
    const session = await getSessionService(c.req.raw.headers);
    if (!session) return c.json(null, 200);
    const organizationId = session.session.activeOrganizationId;
    const scope = organizationId ? orgScope(organizationId) : SYSTEM_SCOPE;
    const permissions = await getUserPermissions(session.user.id, scope);
    return c.json({ ...session, permissions }, 200);
  },
});
