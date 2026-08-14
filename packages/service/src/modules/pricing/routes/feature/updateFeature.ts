import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { updateFeature as updateFeatureService } from "#modules/pricing/feature.service";
import {
  featureIdParamSchema,
  featureSchema,
  updateFeatureBodySchema,
} from "./schema";

export const updateFeatureRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "updateFeature",
    method: "put",
    path: "/{id}",
    tags: ["Features"],
    summary: "Update a feature",
    request: {
      params: featureIdParamSchema,
      body: {
        content: { "application/json": { schema: updateFeatureBodySchema } },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(featureSchema, "The updated feature"),
      ...notFoundResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/feature:update");
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const feature = await updateFeatureService(id, body);
    return c.json(feature, 200);
  },
});
