import { createRoute, defineOpenAPIRoute, z } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { applicationIdParamSchema } from "#routes/application/schema";
import { listAppConfigsByGroup } from "#services/application-config.service";
import { assertAccess } from "#services/role-permission.service";
import { applicationConfigItemSchema } from "./schema";

export const listApplicationConfigsByGroupRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listApplicationConfigsByGroup",
    method: "get",
    path: "/{id}/config/{group}",
    tags: ["ApplicationConfig"],
    summary: "List an application's configurations by group",
    description:
      "Returns all configurations for a specific group scoped to an application.",
    request: {
      params: applicationIdParamSchema.extend({
        group: z.string().min(1).openapi({ example: "ai-agent" }),
      }),
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(
        applicationConfigItemSchema.array(),
        "List of configurations for the application group",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/application:update");
    const { id, group } = c.req.valid("param");
    const configs = await listAppConfigsByGroup(id, group);
    return c.json(configs, 200);
  },
});
