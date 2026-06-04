import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { listAllConfigs } from "#services/system-config.service";
import { prepend } from "#utils/list";
import { getConfigsQuerySchema, systemConfigItemSchema } from "./schema";

export const listAllConfigsRoute = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("system-config::list")),
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
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(
        systemConfigItemSchema.array(),
        "List of system configurations",
      ),
    },
  }),
  handler: async (c) => {
    const { group } = c.req.valid("query");
    const configs = await listAllConfigs(group);
    return c.json(configs, 200);
  },
});
