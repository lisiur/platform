import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAdmin } from "#middleware/require-admin";
import { systemConfigRepository } from "#repositories/system-config.repository";
import {
  errorSchema,
  getConfigsQuerySchema,
  systemConfigItemSchema,
} from "./schema";

export const listAllConfigs = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/",
    tags: ["SystemConfig"],
    summary: "List all system configurations",
    description:
      "Returns all system configurations, optionally filtered by group.",
    middleware: requireAdmin,
    request: {
      query: getConfigsQuerySchema,
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: systemConfigItemSchema.array(),
          },
        },
        description: "List of system configurations",
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
    const { group } = c.req.valid("query");

    if (group) {
      const configs = await systemConfigRepository.findByGroup(group);
      return c.json(configs, 200);
    }

    const configs = await systemConfigRepository.findAll();
    return c.json(configs, 200);
  },
});
