import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAdmin } from "#middleware/require-admin";
import { listApplications as listApplicationsService } from "../../services/application.service";
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
    middleware: requireAdmin,
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
    const result = await listApplicationsService({ search, limit, offset });
    return c.json(result, 200);
  },
});
