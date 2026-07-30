import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  deleteSuccessSchema,
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { deleteAttachments } from "#services/attachment.service";
import {
  assertAccess,
  checkPermission,
} from "#services/role-permission.service";
import { deleteAttachmentsBodySchema } from "./schema";

export const deleteAttachmentsRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "deleteAttachments",
    method: "delete",
    path: "/",
    tags: ["Attachment"],
    summary: "Delete attachments",
    description:
      "Batch delete attachments by IDs, removing files on disk when no other attachments reference them.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: deleteAttachmentsBodySchema,
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
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/attachment:delete");
    const userId = getPrincipalUserId(principal);
    const canManageAll = await checkPermission(
      userId,
      "system/attachment:manage-all",
    );
    const { ids } = c.req.valid("json");

    const deletedIds = await deleteAttachments(ids, { userId, canManageAll });

    await logAudit({
      event: "attachment.deleted",
      category: "file_management",
      severity: "warning",
      metadata: { requestedIds: ids, deletedIds },
      c,
    });

    return c.json({ success: true as const }, 200);
  },
});
