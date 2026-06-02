import { logAudit } from "#lib/logger";
import { deleteOrganization as deleteOrganizationService } from "#services/organization.service";
import { definePermissionRoute } from "../shared/admin-route";
import {
  deleteSuccessSchema,
  errorSchema,
  organizationIdParamSchema,
} from "./schema";

export const deleteOrganization = definePermissionRoute({
  permission: "organization::delete",
  route: {
    method: "delete",
    path: "/{id}",
    tags: ["Organization"],
    summary: "Delete an organization",
    description:
      "Delete an organization by ID. Cascades to members and invitations.",
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
      404: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Not found",
      },
    },
  },
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
