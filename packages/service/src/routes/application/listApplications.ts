import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { listApplications as listApplicationsService } from "#services/application.service";
import { assertAccess } from "#services/role-permission.service";
import {
  listApplicationsQuerySchema,
  listApplicationsResponseSchema,
} from "./schema";

export const listApplications = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listApplications",
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
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/application:list");
    const { search, limit, offset } = c.req.valid("query");
    const result = await listApplicationsService({ search, limit, offset });
    return c.json(result, 200);
  },
});
