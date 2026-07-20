import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { prisma } from "#lib/db";
import { logAudit } from "#lib/logger";
import { createdResponseFn, unauthorizedResponse } from "#lib/openapi";
import { registerOrganizationForUser } from "#services/organization.service";
import {
  errorSchema,
  organizationSchema,
  registerOrganizationBodySchema,
} from "./schema";

export const registerOrganization = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/register",
    tags: ["Organization"],
    summary: "Register an organization for the current user",
    description:
      "Create a new organization and add the authenticated user as its owner.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: registerOrganizationBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      409: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Slug already taken",
      },
      ...createdResponseFn(organizationSchema, "The registered organization"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const body = c.req.valid("json");
    const org = await registerOrganizationForUser(
      getPrincipalUserId(principal),
      body,
    );

    await prisma.session.update({
      where: {
        id: (principal as Extract<typeof principal, { kind: "user" }>).session
          .id,
      },
      data: { activeOrganizationId: org.id },
    });

    logAudit({
      event: "organization.registered",
      category: "organization",
      c,
    });

    return c.json(org, 201);
  },
});
