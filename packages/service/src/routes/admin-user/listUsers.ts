import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { prisma } from "#lib/db";
import { requireAdmin } from "#middleware/require-admin";
import {
  errorSchema,
  listUsersQuerySchema,
  listUsersResponseSchema,
} from "./schema";

export const listUsers = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/",
    tags: ["AdminUser"],
    summary: "List users with custom roles",
    middleware: requireAdmin,
    request: {
      query: listUsersQuerySchema,
    },
    responses: {
      200: {
        content: { "application/json": { schema: listUsersResponseSchema } },
        description: "List of users",
      },
      401: {
        content: { "application/json": { schema: errorSchema } },
        description: "Unauthorized",
      },
    },
  }),
  handler: async (c) => {
    const { limit, offset } = c.req.valid("query");

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        take: limit,
        skip: offset,
        orderBy: { createdAt: "desc" },
        include: {
          userRoles: {
            include: {
              role: {
                select: {
                  id: true,
                  appId: true,
                  name: true,
                  code: true,
                },
              },
            },
          },
        },
      }),
      prisma.user.count(),
    ]);

    return c.json({ users, total }, 200);
  },
});
