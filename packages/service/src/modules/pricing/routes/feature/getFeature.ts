import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { getFeature as getFeatureService } from "#modules/pricing/feature.service";
import { featureIdParamSchema, featureSchema } from "./schema";

export const getFeatureRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getFeature",
    method: "get",
    path: "/{id}",
    tags: ["Features"],
    summary: "Get a feature by ID",
    request: { params: featureIdParamSchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(featureSchema, "The feature"),
      ...notFoundResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/feature:list");
    const { id } = c.req.valid("param");
    const feature = await getFeatureService(id);
    return c.json(feature, 200);
  },
});
