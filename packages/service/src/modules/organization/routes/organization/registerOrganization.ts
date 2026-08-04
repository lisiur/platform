import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { prisma } from "#lib/db";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  createdResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { registerOrganizationForUser } from "#modules/organization/organization.service";
import { organizationSchema, registerOrganizationBodySchema } from "./schema";

export const registerOrganization = defineOpenAPIRoute({
  route: createRoute({
    operationId: "registerOrganization",
    method: "post",
    path: "/register",
    tags: ["Organization"],
    summary: "Register an organization for the current user",
    description:
      "Create a new organization and add the authenticated user as its owner. Accepts multipart/form-data with optional logo file.",
    request: {
      body: {
        content: {
          "multipart/form-data": {
            schema: registerOrganizationBodySchema,
          },
        },
      },
    },
    responses: {
      ...badRequestResponse,
      ...unauthorizedResponse,
      409: {
        description: "Slug already taken",
      },
      ...createdResponseFn(organizationSchema, "The registered organization"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);

    const contentType = c.req.raw.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new HTTPException(400, {
        message: "Expected multipart/form-data",
      });
    }

    const body = c.req.valid("form");
    const name = body.name;
    const slug = body.slug;

    if (!name || !slug) {
      throw new HTTPException(400, { message: "name and slug are required" });
    }

    const logoFile = body.logo instanceof File ? body.logo : undefined;
    const org = await registerOrganizationForUser(
      getPrincipalUserId(principal),
      { name, slug },
      logoFile,
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
