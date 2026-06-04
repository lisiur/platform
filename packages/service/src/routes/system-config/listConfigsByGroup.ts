import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { listConfigsByGroup } from "#services/system-config.service";
import { prepend } from "#utils/list";
import { getConfigsByGroupParamSchema, systemConfigItemSchema } from "./schema";

export const listConfigsByGroupRoute = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("system-config::listByGroup")),
    method: "get",
    path: "/{group}",
    tags: ["SystemConfig"],
    summary: "List configurations by group",
    description: "Returns all system configurations for a specific group.",
    request: {
      params: getConfigsByGroupParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(
        systemConfigItemSchema.array(),
        "List of system configurations for the group",
      ),
    },
  }),
  handler: async (c) => {
    const { group } = c.req.valid("param");
    const configs = await listConfigsByGroup(group);
    return c.json(configs, 200);
  },
});
