import { logAudit } from "#lib/logger";
import { deleteLogs } from "#services/operation-log.service";
import { defineAdminRoute } from "../shared/admin-route";
import { deleteLogsBodySchema, deleteSuccessSchema } from "./schema";

export const deleteLogsRoute = defineAdminRoute({
  route: {
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
      200: {
        content: {
          "application/json": { schema: deleteSuccessSchema },
        },
        description: "Successfully deleted",
      },
    },
  },
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
