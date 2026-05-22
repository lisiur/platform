import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { configCache } from "@/lib/config-cache";
import { requireAdmin } from "@/middleware/require-admin";
import { systemConfigRepository } from "@/repositories/system-config.repository";
import {
  errorSchema,
  getConfigsByGroupParamSchema,
  systemConfigItemSchema,
} from "./schema";

export const listConfigsByGroup = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/{group}",
    tags: ["SystemConfig"],
    summary: "List configurations by group",
    description: "Returns all system configurations for a specific group.",
    middleware: requireAdmin,
    request: {
      params: getConfigsByGroupParamSchema,
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: systemConfigItemSchema.array(),
          },
        },
        description: "List of system configurations for the group",
      },
      401: {
        content: {
          "application/json": {
            schema: errorSchema,
          },
        },
        description: "Unauthorized",
      },
    },
  }),
  handler: async (c) => {
    const { group } = c.req.valid("param");

    const cached = configCache.get(group);
    if (cached) {
      return c.json(cached, 200);
    }

    const configs = await systemConfigRepository.findByGroup(group);
    configCache.set(group, configs);
    return c.json(configs, 200);
  },
});
