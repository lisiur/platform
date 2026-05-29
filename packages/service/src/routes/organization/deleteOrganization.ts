import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { logAudit } from "#lib/logger";
import { requireAdmin } from "#middleware/require-admin";
import { deleteOrganization as deleteOrganizationService } from "#services/organization.service";
import {
  deleteSuccessSchema,
  errorSchema,
  organizationIdParamSchema,
} from "./schema";

export const deleteOrganization = defineOpenAPIRoute({
  route: createRoute({
    method: "delete",
    path: "/{id}",
    tags: ["Organization"],
    summary: "Delete an organization",
    description:
      "Delete an organization by ID. Cascades to members and invitations.",
    middleware: requireAdmin,
    request: {
      params: organizationIdParamSchema,
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: deleteSuccessSchema },
        },
        description: "Successfully deleted",
      },
      401: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Unauthorized",
      },
      404: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Not found",
      },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const { name } = await deleteOrganizationService(id);

    logAudit({
      event: "organization.deleted",
      category: "organization",
      targetId: id,
      targetName: name,
      c,
    });

    return c.json({ success: true as const }, 200);
  },
});
