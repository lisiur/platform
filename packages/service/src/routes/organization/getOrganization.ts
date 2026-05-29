import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAdmin } from "#middleware/require-admin";
import { getOrganizationById } from "#services/organization.service";
import {
  errorSchema,
  organizationIdParamSchema,
  organizationSchema,
} from "./schema";

export const getOrganization = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/{id}",
    tags: ["Organization"],
    summary: "Get an organization",
    description: "Returns a single organization by ID.",
    middleware: requireAdmin,
    request: {
      params: organizationIdParamSchema,
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: organizationSchema },
        },
        description: "The organization",
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
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const org = await getOrganizationById(id);
    return c.json(org, 200);
  },
});
