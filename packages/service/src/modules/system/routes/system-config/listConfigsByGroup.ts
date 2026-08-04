import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { listConfigsByGroup } from "#modules/system/public";
import { getConfigsByGroupParamSchema, systemConfigItemSchema } from "./schema";

export const listConfigsByGroupRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listConfigsByGroup",
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
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/system-config:listByGroup");
    const { group } = c.req.valid("param");
    const configs = await listConfigsByGroup(group);
    return c.json(configs, 200);
  },
});
