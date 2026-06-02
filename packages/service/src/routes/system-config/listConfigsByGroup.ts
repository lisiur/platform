import { listConfigsByGroup } from "#services/system-config.service";
import { definePermissionRoute } from "../shared/admin-route";
import { getConfigsByGroupParamSchema, systemConfigItemSchema } from "./schema";

export const listConfigsByGroupRoute = definePermissionRoute({
  permission: "system-config::listByGroup",
  route: {
    method: "get",
    path: "/{group}",
    tags: ["SystemConfig"],
    summary: "List configurations by group",
    description: "Returns all system configurations for a specific group.",
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
    },
  },
  handler: async (c) => {
    const { group } = c.req.valid("param");
    const configs = await listConfigsByGroup(group);
    return c.json(configs, 200);
  },
});
