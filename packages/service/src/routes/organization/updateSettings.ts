import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  errorSchema,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { updateOrganization as updateOrganizationService } from "#services/organization.service";
import { assertAccess } from "#services/role-permission.service";
import {
  organizationIdParamSchema,
  organizationSchema,
  updateOrganizationBodySchema,
} from "./schema";

export const updateOrganizationSettings = defineOpenAPIRoute({
  route: createRoute({
    method: "put",
    path: "/{id}/settings",
    tags: ["Organization"],
    summary: "Update organization settings",
    description:
      "Updates an organization's settings. Requires organization-settings::update for this organization.",
    request: {
      params: organizationIdParamSchema,
      body: {
        content: {
          "application/json": { schema: updateOrganizationBodySchema },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      409: {
        content: { "application/json": { schema: errorSchema } },
        description: "Slug already taken",
      },
      ...okResponseFn(organizationSchema, "The updated organization"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    await assertAccess(principal, "organization-settings::update", {
      appId: "organization",
      organizationId: id,
    });

    const org = await updateOrganizationService(id, body);

    await logAudit({
      event: "organization.settings.updated",
      category: "organization",
      c,
    });

    return c.json(org, 200);
  },
});
