import { getOrganizationById } from "#services/organization.service";
import { defineAdminRoute } from "../shared/admin-route";
import {
  errorSchema,
  organizationIdParamSchema,
  organizationSchema,
} from "./schema";

export const getOrganization = defineAdminRoute({
  route: {
    method: "get",
    path: "/{id}",
    tags: ["Organization"],
    summary: "Get an organization",
    description: "Returns a single organization by ID.",
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
      404: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Not found",
      },
    },
  },
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const org = await getOrganizationById(id);
    return c.json(org, 200);
  },
});
