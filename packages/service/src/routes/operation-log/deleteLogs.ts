import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { logAudit } from "#lib/logger";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { deleteLogs } from "#services/operation-log.service";
import { prepend } from "#utils/list";
import { deleteLogsBodySchema, deleteSuccessSchema } from "./schema";

export const deleteLogsRoute = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("operation-log::delete")),
    method: "delete",
    path: "/",
    tags: ["Log"],
    summary: "Delete logs",
    description: "Batch delete operation logs by IDs.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: deleteLogsBodySchema,
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
    const { ids } = c.req.valid("json");

    await deleteLogs(ids);

    await logAudit({
      event: "operation_log.deleted",
      category: "log_management",
      severity: "warning",
      targetType: "operation_log",
      metadata: { ids },
      c,
    });

    return c.json({ success: true as const }, 200);
  },
});
