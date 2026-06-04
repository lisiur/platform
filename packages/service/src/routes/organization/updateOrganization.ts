import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { logAudit } from "#lib/logger";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { updateOrganization as updateOrganizationService } from "#services/organization.service";
import { prepend } from "#utils/list";
import {
  errorSchema,
  organizationIdParamSchema,
  organizationSchema,
  updateOrganizationBodySchema,
} from "./schema";

export const updateOrganization = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("organization::update")),
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
      ...unauthorizedResponse,

      ...forbiddenResponse,
      ...notFoundResponse,
      409: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Slug already taken",
      },
      ...okResponseFn(organizationSchema, "The updated organization"),
    },
  }),
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
