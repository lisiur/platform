import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { applicationIdParamSchema } from "#routes/application/schema";
import { batchUpsertAppConfigs } from "#services/application-config.service";
import { assertAccess } from "#services/role-permission.service";
import { applicationConfigItemSchema, batchUpsertBodySchema } from "./schema";

export const batchUpsertApplicationConfigsRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "batchUpsertApplicationConfigs",
    method: "put",
    path: "/{id}/config",
    tags: ["ApplicationConfig"],
    summary: "Batch upsert an application's configurations",
    description:
      "Create or update multiple application configuration items at once.",
    request: {
      params: applicationIdParamSchema,
      body: {
        content: {
          "application/json": {
            schema: batchUpsertBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...badRequestResponse,
      ...okResponseFn(
        applicationConfigItemSchema.array(),
        "The upserted configurations",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/application:update");
    const { id } = c.req.valid("param");
    const { items } = c.req.valid("json");

    const configs = await batchUpsertAppConfigs(
      items.map((item) => ({ appId: id, ...item })),
    );

    await logAudit({
      event: "application_config.batch_updated",
      category: "application_config",
      metadata: {
        appId: id,
        keys: items.map((i) => `${i.group}.${i.key}`),
      },
      c,
    });

    return c.json(configs, 200);
  },
});
