import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { configCache } from "@/lib/config-cache";
import { requireAdmin } from "@/middleware/require-admin";
import { systemConfigRepository } from "@/repositories/system-config.repository";
import {
  deleteConfigParamSchema,
  deleteSuccessSchema,
  errorSchema,
} from "./schema";

export const deleteConfig = defineOpenAPIRoute({
  route: createRoute({
    method: "delete",
    path: "/{group}/{key}",
    tags: ["SystemConfig"],
    summary: "Delete a configuration",
    description: "Delete a system configuration item.",
    middleware: requireAdmin,
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
      401: {
        content: {
          "application/json": {
            schema: errorSchema,
          },
        },
        description: "Unauthorized",
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
  }),
  handler: async (c) => {
    const { group, key } = c.req.valid("param");

    try {
      await systemConfigRepository.delete(group, key);
      configCache.invalidate(group);
      return c.json({ success: true as const }, 200);
    } catch {
      throw new HTTPException(404, { message: "Config not found" });
    }
  },
});
