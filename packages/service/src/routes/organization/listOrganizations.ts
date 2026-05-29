import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAdmin } from "#middleware/require-admin";
import { listOrganizations as listOrganizationsService } from "#services/organization.service";
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
    const result = await listOrganizationsService({ limit, offset });
    return c.json(result, 200);
  },
});
