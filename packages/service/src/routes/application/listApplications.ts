import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { prisma } from "../../lib/db";
import {
  errorSchema,
  listApplicationsQuerySchema,
  listApplicationsResponseSchema,
} from "./schema";

export const listApplications = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/",
    tags: ["Application"],
    summary: "List all applications",
    description:
      "Returns a paginated list of applications with optional search.",
    request: {
      query: listApplicationsQuerySchema,
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: listApplicationsResponseSchema,
          },
        },
        description: "Paginated list of applications",
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
    const { search, limit, offset } = c.req.valid("query");

    const where = {
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { code: { contains: search, mode: "insensitive" as const } },
              {
                description: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    };

    const [applications, total] = await Promise.all([
      prisma.application.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        take: limit,
        skip: offset,
      }),
      prisma.application.count({ where }),
    ]);

    return c.json({ applications, total }, 200);
  },
});
