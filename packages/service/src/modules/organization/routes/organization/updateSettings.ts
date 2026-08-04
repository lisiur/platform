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
import { orgScope } from "#lib/scope";
import { assertAccess } from "#modules/access-control/public";
import { updateOrganization as updateOrganizationService } from "#modules/organization/organization.service";
import {
  organizationIdParamSchema,
  organizationSchema,
  updateOrganizationSettingsBodySchema,
} from "./schema";

export const updateOrganizationSettings = defineOpenAPIRoute({
  route: createRoute({
    operationId: "updateOrganizationSettings",
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
          "application/json": { schema: updateOrganizationSettingsBodySchema },
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

    await assertAccess(
      principal,
      "org/organization-settings:update",
      orgScope(id),
    );

    const org = await updateOrganizationService(id, body);

    await logAudit({
      event: "organization.settings.updated",
      category: "organization",
      c,
    });

    return c.json(org, 200);
  },
});
