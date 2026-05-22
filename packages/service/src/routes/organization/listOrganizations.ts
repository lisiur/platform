import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { prisma } from "#lib/db";
import { requireAdmin } from "#middleware/require-admin";
import {
  errorSchema,
  listOrganizationsQuerySchema,
  listOrganizationsResponseSchema,
} from "./schema";

export const listOrganizations = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/",
    tags: ["Organization"],
    summary: "List all organizations",
    description: "Returns a paginated list of all organizations.",
    middleware: requireAdmin,
    request: {
      query: listOrganizationsQuerySchema,
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: listOrganizationsResponseSchema,
          },
        },
        description: "Paginated list of organizations",
      },
      401: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Unauthorized",
      },
    },
  }),
  handler: async (c) => {
    const { limit, offset } = c.req.valid("query");

    const [organizations, total] = await Promise.all([
      prisma.organization.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.organization.count(),
    ]);

    return c.json({ organizations, total }, 200);
  },
});
