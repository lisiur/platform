import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { getOrganizationById } from "#services/organization.service";
import { assertAccess } from "#services/role-permission.service";
import { organizationIdParamSchema, organizationSchema } from "./schema";

export const getOrganization = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/{id}",
    tags: ["Organization"],
    summary: "Get an organization",
    description: "Returns a single organization by ID.",
    request: {
      params: organizationIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(organizationSchema, "The organization"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/organization:view");
    const { id } = c.req.valid("param");
    const org = await getOrganizationById(id);
    return c.json(org, 200);
  },
});
