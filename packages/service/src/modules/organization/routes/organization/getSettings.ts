import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { orgScope } from "#lib/scope";
import { assertAccess } from "#modules/access-control/public";
import { getOrganizationById } from "#modules/organization/organization.service";
import { organizationIdParamSchema, organizationSchema } from "./schema";

export const getOrganizationSettings = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getOrganizationSettings",
    method: "get",
    path: "/{id}/settings",
    tags: ["Organization"],
    summary: "Get organization settings",
    description:
      "Returns the settings for an organization. Requires organization-settings::view for this organization.",
    request: {
      params: organizationIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(organizationSchema, "The organization settings"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const { id } = c.req.valid("param");

    await assertAccess(
      principal,
      "org/organization-settings:view",
      orgScope(id),
    );

    const org = await getOrganizationById(id);
    return c.json(org, 200);
  },
});
