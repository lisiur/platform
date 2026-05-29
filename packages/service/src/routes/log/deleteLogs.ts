import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { logAudit } from "#lib/logger";
import { requireAdmin } from "#middleware/require-admin";
import { deleteLogs } from "#services/log.service";
import {
  deleteLogsBodySchema,
  deleteSuccessSchema,
  errorSchema,
} from "./schema";

export const deleteLogsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "delete",
    path: "/",
    tags: ["Log"],
    summary: "Delete logs",
    description: "Batch delete operation logs by IDs.",
    middleware: requireAdmin,
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
      401: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Unauthorized",
      },
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
