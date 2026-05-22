import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import { requireAdmin } from "#middleware/require-admin";
import {
  createOrganizationBodySchema,
  errorSchema,
  organizationSchema,
} from "./schema";

export const createOrganization = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/",
    tags: ["Organization"],
    summary: "Create an organization",
    description: "Create a new organization.",
    middleware: requireAdmin,
    request: {
      body: {
        content: {
          "application/json": {
            schema: createOrganizationBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      201: {
        content: {
          "application/json": { schema: organizationSchema },
        },
        description: "The created organization",
      },
      401: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Unauthorized",
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
    const body = c.req.valid("json");

    const existing = await prisma.organization.findUnique({
      where: { slug: body.slug },
    });
    if (existing) {
      throw new HTTPException(409, { message: "Slug already taken" });
    }

    const org = await prisma.organization.create({
      data: {
        name: body.name,
        slug: body.slug,
        logo: body.logo,
        metadata: body.metadata,
        createdAt: new Date(),
      },
    });

    return c.json(org, 201);
  },
});
