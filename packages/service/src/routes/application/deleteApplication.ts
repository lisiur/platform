import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { logAudit } from "#lib/logger";
import { requireAdmin } from "#middleware/require-admin";
// TODO: use #services/application alias once #services/* is added to package.json imports
import { deleteApplication as deleteApplicationService } from "../../services/application.service";
import {
  applicationIdParamSchema,
  deleteSuccessSchema,
  errorSchema,
} from "./schema";

export const deleteApplication = defineOpenAPIRoute({
  route: createRoute({
    method: "delete",
    path: "/{id}",
    tags: ["Application"],
    summary: "Delete an application",
    description: "Soft-delete an application by ID.",
    middleware: requireAdmin,
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
