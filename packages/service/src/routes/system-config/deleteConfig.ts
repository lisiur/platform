import { logAudit } from "#lib/logger";
import { deleteConfig } from "#services/system-config.service";
import { definePermissionRoute } from "../shared/admin-route";
import {
  deleteConfigParamSchema,
  deleteSuccessSchema,
  errorSchema,
} from "./schema";

export const deleteConfigRoute = definePermissionRoute({
  permission: "system-config::delete",
  route: {
    method: "delete",
    path: "/{group}/{key}",
    tags: ["SystemConfig"],
    summary: "Delete a configuration",
    description: "Delete a system configuration item.",
    request: {
      params: deleteConfigParamSchema,
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: deleteSuccessSchema,
          },
        },
        description: "Successfully deleted",
      },
      404: {
        content: {
          "application/json": {
            schema: errorSchema,
          },
        },
        description: "Config not found",
      },
    },
  },
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
