import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { logAudit } from "#lib/logger";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { deleteConfig } from "#services/system-config.service";
import { prepend } from "#utils/list";
import {
  deleteConfigParamSchema,
  deleteSuccessSchema,
  errorSchema,
} from "./schema";

export const deleteConfigRoute = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("system-config::delete")),
    method: "delete",
    path: "/{group}/{key}",
    tags: ["SystemConfig"],
    summary: "Delete a configuration",
    description: "Delete a system configuration item.",
    request: {
      params: deleteConfigParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      404: {
        content: {
          "application/json": {
            schema: errorSchema,
          },
        },
        description: "Config not found",
      },
      ...okResponseFn(deleteSuccessSchema, "Successfully deleted"),
    },
  }),
  handler: async (c) => {
    const { group, key } = c.req.valid("param");

    await deleteConfig(group, key);

    await logAudit({
      event: "system_config.deleted",
      category: "system_config",
      targetName: `${group}.${key}`,
      c,
    });

    return c.json({ success: true as const }, 200);
  },
});
