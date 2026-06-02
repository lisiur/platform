import { listOrganizations as listOrganizationsService } from "#services/organization.service";
import { definePermissionRoute } from "../shared/admin-route";
import {
  listOrganizationsQuerySchema,
  listOrganizationsResponseSchema,
} from "./schema";

export const listOrganizations = definePermissionRoute({
  permission: "organization::list",
  route: {
    method: "get",
    path: "/",
    tags: ["Organization"],
    summary: "List all organizations",
    description: "Returns a paginated list of all organizations.",
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
    },
  },
  handler: async (c) => {
    const { limit, offset } = c.req.valid("query");
    const result = await listOrganizationsService({ limit, offset });
    return c.json(result, 200);
  },
});
