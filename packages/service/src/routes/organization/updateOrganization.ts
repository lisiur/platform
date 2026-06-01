import { logAudit } from "#lib/logger";
import { updateOrganization as updateOrganizationService } from "#services/organization.service";
import { defineAdminRoute } from "../shared/admin-route";
import {
  errorSchema,
  organizationIdParamSchema,
  organizationSchema,
  updateOrganizationBodySchema,
} from "./schema";

export const updateOrganization = defineAdminRoute({
  route: {
    method: "put",
    path: "/{id}",
    tags: ["Organization"],
    summary: "Update an organization",
    description: "Update an organization by ID.",
    request: {
      params: organizationIdParamSchema,
      body: {
        content: {
          "application/json": {
            schema: updateOrganizationBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: organizationSchema },
        },
        description: "The updated organization",
      },
      404: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Not found",
      },
      409: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Slug already taken",
      },
    },
  },
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const org = await updateOrganizationService(id, body);

    logAudit({
      event: "organization.updated",
      category: "organization",
      targetId: org.id,
      targetName: org.name,
      c,
    });

    return c.json(org, 200);
  },
});
