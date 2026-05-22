import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import { requireAdmin } from "#middleware/require-admin";
import {
  errorSchema,
  organizationIdParamSchema,
  organizationSchema,
  updateOrganizationBodySchema,
} from "./schema";

export const updateOrganization = defineOpenAPIRoute({
  route: createRoute({
    method: "put",
    path: "/{id}",
    tags: ["Organization"],
    summary: "Update an organization",
    description: "Update an organization by ID.",
    middleware: requireAdmin,
    request: {
      params: organizationIdParamSchema,
      body: {
        content: {
          "application/json": {
            schema: updateOrganizationBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: organizationSchema },
        },
        description: "The updated organization",
      },
      401: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Unauthorized",
      },
      404: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Not found",
      },
      409: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Slug already taken",
      },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const existing = await prisma.organization.findUnique({ where: { id } });
    if (!existing) {
      throw new HTTPException(404, { message: "Organization not found" });
    }

    if (body.slug && body.slug !== existing.slug) {
      const slugTaken = await prisma.organization.findUnique({
        where: { slug: body.slug },
      });
      if (slugTaken) {
        throw new HTTPException(409, { message: "Slug already taken" });
      }
    }

    const org = await prisma.organization.update({
      where: { id },
      data: body,
    });

    return c.json(org, 200);
  },
});
