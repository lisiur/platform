import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { deleteLogs } from "#services/operation-log.service";
import { assertAccess } from "#services/role-permission.service";
import { deleteLogsBodySchema, deleteSuccessSchema } from "./schema";

export const deleteLogsRoute = defineOpenAPIRoute({
  route: createRoute({
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
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "operation-log::delete");
    const { ids } = c.req.valid("json");

    await deleteLogs(ids);

    await logAudit({
      event: "operation_log.deleted",
      category: "log_management",
      severity: "warning",
      metadata: { ids },
      c,
    });

    return c.json({ success: true as const }, 200);
  },
});
