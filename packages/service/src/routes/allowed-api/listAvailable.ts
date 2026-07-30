import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  serviceUnavailableResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { applicationIdParamSchema } from "#routes/application/schema";
import { listAvailableApis } from "#services/agent-config.service";
import { assertAccess } from "#services/role-permission.service";
import { availableOperationSchema } from "./schema";

export const listAvailableApisRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listAvailableApis",
    method: "get",
    path: "/{id}/allowed-apis/available",
    tags: ["AllowedApi"],
    summary: "List all platform operations available to expose to the agent",
    description:
      "Returns every operation in the platform OpenAPI spec, so the admin UI " +
      "can render the picker. method/path are authoritative and re-read on save.",
    request: {
      params: applicationIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...serviceUnavailableResponse,
      ...okResponseFn(
        availableOperationSchema.array(),
        "Available platform operations",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/application:update");
    c.req.valid("param"); // validates id param exists, not used further

    const ops = await listAvailableApis();
    return c.json(ops, 200);
  },
});
