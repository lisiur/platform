import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { applicationIdParamSchema } from "#routes/application/schema";
import { getAllowedApis } from "#services/agent-config.service";
import { assertAccess } from "#services/role-permission.service";
import { allowedApisSchema } from "./schema";

export const listAllowedApisRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listAllowedApis",
    method: "get",
    path: "/{id}/allowed-apis",
    tags: ["AllowedApi"],
    summary: "List an application's allowed API operationIds",
    description:
      "Returns the operationIds the application has chosen to expose to its " +
      "AI Agent as available APIs.",
    request: {
      params: applicationIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(
        allowedApisSchema,
        "The application's allowed API operationIds",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/application:update");
    const { id } = c.req.valid("param");

    const operationIds = await getAllowedApis(id);
    return c.json(operationIds ?? [], 200);
  },
});
