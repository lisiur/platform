import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { listApplications as listApplicationsService } from "#services/application.service";
import { prepend } from "#utils/list";
import {
  listApplicationsQuerySchema,
  listApplicationsResponseSchema,
} from "./schema";

export const listApplications = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("application::list")),
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
      ...unauthorizedResponse,

      ...forbiddenResponse,
      ...okResponseFn(
        listApplicationsResponseSchema,
        "Paginated list of applications",
      ),
    },
  }),
  handler: async (c) => {
    const { search, limit, offset } = c.req.valid("query");
    const result = await listApplicationsService({ search, limit, offset });
    return c.json(result, 200);
  },
});
