import { getApplicationById } from "#services/application.service";
import { defineAdminRoute } from "../shared/admin-route";
import {
  applicationIdParamSchema,
  applicationSchema,
  errorSchema,
} from "./schema";

export const getApplication = defineAdminRoute({
  route: {
    method: "get",
    path: "/{id}",
    tags: ["Application"],
    summary: "Get an application",
    description: "Returns a single application by ID.",
    request: {
      params: applicationIdParamSchema,
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: applicationSchema },
        },
        description: "The application",
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
    const app = await getApplicationById(id);
    return c.json(app, 200);
  },
});
