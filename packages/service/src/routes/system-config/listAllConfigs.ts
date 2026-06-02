import { listAllConfigs } from "#services/system-config.service";
import { definePermissionRoute } from "../shared/admin-route";
import { getConfigsQuerySchema, systemConfigItemSchema } from "./schema";

export const listAllConfigsRoute = definePermissionRoute({
  permission: "system-config::list",
  route: {
    method: "get",
    path: "/",
    tags: ["SystemConfig"],
    summary: "List all system configurations",
    description:
      "Returns all system configurations, optionally filtered by group.",
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
    },
  },
  handler: async (c) => {
    const { group } = c.req.valid("query");
    const configs = await listAllConfigs(group);
    return c.json(configs, 200);
  },
});
