import { listApplications as listApplicationsService } from "#services/application.service";
import { definePermissionRoute } from "../shared/admin-route";
import {
  listApplicationsQuerySchema,
  listApplicationsResponseSchema,
} from "./schema";

export const listApplications = definePermissionRoute({
  permission: "application::list",
  route: {
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
    },
  },
  handler: async (c) => {
    const { search, limit, offset } = c.req.valid("query");
    const result = await listApplicationsService({ search, limit, offset });
    return c.json(result, 200);
  },
});
