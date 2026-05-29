import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAdmin } from "#middleware/require-admin";
import { listConfigsByGroup } from "#services/system-config.service";
import {
  errorSchema,
  getConfigsByGroupParamSchema,
  systemConfigItemSchema,
} from "./schema";

export const listConfigsByGroupRoute = defineOpenAPIRoute({
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
          "application/json": { schema: errorSchema },
        },
        description: "Unauthorized",
      },
    },
  }),
  handler: async (c) => {
    const { group } = c.req.valid("param");
    const configs = await listConfigsByGroup(group);
    return c.json(configs, 200);
  },
});
