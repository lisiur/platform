import { logAudit } from "#lib/logger";
import { deleteApplication as deleteApplicationService } from "#services/application.service";
import { definePermissionRoute } from "../shared/admin-route";
import {
  applicationIdParamSchema,
  deleteSuccessSchema,
  errorSchema,
} from "./schema";

export const deleteApplication = definePermissionRoute({
  permission: "application::delete",
  route: {
    method: "delete",
    path: "/{id}",
    tags: ["Application"],
    summary: "Delete an application",
    description: "Soft-delete an application by ID.",
    request: {
      params: applicationIdParamSchema,
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

    const app = await deleteApplicationService(id);

    logAudit({
      event: "application.deleted",
      category: "application",
      targetId: id,
      targetName: app.name,
      c,
    });

    return c.json({ success: true as const }, 200);
  },
});
