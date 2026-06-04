import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { logAudit } from "#lib/logger";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { deleteApplication as deleteApplicationService } from "#services/application.service";
import { prepend } from "#utils/list";
import { applicationIdParamSchema, deleteSuccessSchema } from "./schema";

export const deleteApplication = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("application::delete")),
    method: "delete",
    path: "/{id}",
    tags: ["Application"],
    summary: "Delete an application",
    description: "Soft-delete an application by ID.",
    request: {
      params: applicationIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,

      ...forbiddenResponse,
      ...okResponseFn(deleteSuccessSchema, "Successfully deleted"),
      ...notFoundResponse,
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
