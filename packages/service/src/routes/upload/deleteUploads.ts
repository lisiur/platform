import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireSession } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  deleteSuccessSchema,
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertPermission } from "#services/role-permission.service";
import { deleteUploads } from "#services/upload.service";
import { deleteUploadsBodySchema } from "./schema";

export const deleteUploadsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "delete",
    path: "/",
    tags: ["Upload"],
    summary: "Delete uploads",
    description: "Batch delete uploaded files by IDs, removing files on disk.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: deleteUploadsBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(deleteSuccessSchema, "Successfully deleted"),
    },
  }),
  handler: async (c) => {
    const session = await requireSession(c);
    await assertPermission(session.user.id, "upload::delete");
    const { ids } = c.req.valid("json");

    await deleteUploads(ids);

    await logAudit({
      event: "upload.deleted",
      category: "file_management",
      severity: "warning",
      targetType: "upload",
      metadata: { ids },
      c,
    });

    return c.json({ success: true as const }, 200);
  },
});
