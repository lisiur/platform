import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  forbiddenResponse,
  okResponseFn,
  serviceUnavailableResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { replaceAllowedApis } from "#modules/agent/agent-config.service";
import { applicationIdParamSchema } from "#modules/application/routes/application/schema";
import { allowedApisBodySchema, allowedApisSchema } from "./schema";

export const replaceAllowedApisRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "replaceAllowedApis",
    method: "put",
    path: "/{id}/allowed-apis",
    tags: ["AllowedApi"],
    summary: "Replace an application's allowed API selection",
    description:
      "Set the app's allowed API operationIds to exactly the given list. Each " +
      "operationId must exist in the platform OpenAPI spec.",
    request: {
      params: applicationIdParamSchema,
      body: {
        content: {
          "application/json": {
            schema: allowedApisBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...badRequestResponse,
      ...serviceUnavailableResponse,
      ...okResponseFn(
        allowedApisSchema,
        "The application's resulting allowed API operationIds",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/application:update");
    const { id } = c.req.valid("param");
    const { operationIds } = c.req.valid("json");

    const result = await replaceAllowedApis(id, operationIds);

    await logAudit({
      event: "allowed_apis.replaced",
      category: "application_config",
      metadata: {
        appId: id,
        count: result.length,
        operationIds: result,
      },
      c,
    });

    return c.json(result, 200);
  },
});
