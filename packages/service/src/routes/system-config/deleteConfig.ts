import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#services/role-permission.service";
import { deleteConfig } from "#services/system-config.service";
import {
  deleteConfigParamSchema,
  deleteSuccessSchema,
  errorSchema,
} from "./schema";

export const deleteConfigRoute = defineOpenAPIRoute({
  route: createRoute({
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
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system-config::delete");
    const { group, key } = c.req.valid("param");

    await deleteConfig(group, key);

    await logAudit({
      event: "system_config.deleted",
      category: "system_config",
      c,
    });

    return c.json({ success: true as const }, 200);
  },
});
