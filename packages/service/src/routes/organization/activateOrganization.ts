import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  forbiddenResponse,
  notFoundResponse,
  successSchema,
  unauthorizedResponse,
} from "#lib/openapi";
import { activateOrganizationForUser } from "#services/organization.service";
import { organizationIdParamSchema } from "./schema";

export const activateOrganization = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/{id}/activate",
    tags: ["Organization"],
    summary: "Set the current user's active organization",
    description:
      "Activates the given organization for the current session. The user must be a member.",
    request: {
      params: organizationIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      200: {
        content: { "application/json": { schema: successSchema } },
        description: "Organization activated",
      },
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const { id } = c.req.valid("param");

    await activateOrganizationForUser({
      sessionId: (principal as Extract<typeof principal, { kind: "user" }>)
        .session.id,
      userId: getPrincipalUserId(principal),
      organizationId: id,
    });

    await logAudit({
      c,
      event: "organization.activated",
      category: "organization",
    });

    return c.json({ success: true }, 200);
  },
});
