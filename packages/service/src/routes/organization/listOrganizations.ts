import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { listOrganizations as listOrganizationsService } from "#services/organization.service";
import { assertAccess } from "#services/role-permission.service";
import {
  listOrganizationsQuerySchema,
  listOrganizationsResponseSchema,
} from "./schema";

export const listOrganizations = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listOrganizations",
    method: "get",
    path: "/",
    tags: ["Organization"],
    summary: "List all organizations",
    description: "Returns a paginated list of all organizations.",
    request: {
      query: listOrganizationsQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(
        listOrganizationsResponseSchema,
        "Paginated list of organizations",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/organization:list");
    const { limit, offset } = c.req.valid("query");
    const result = await listOrganizationsService({ limit, offset });
    return c.json(result, 200);
  },
});
