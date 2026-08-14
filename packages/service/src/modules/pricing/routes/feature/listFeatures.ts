import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { listFeatures as listFeaturesService } from "#modules/pricing/feature.service";
import { listFeaturesQuerySchema, listFeaturesResponseSchema } from "./schema";

export const listFeaturesRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listFeatures",
    method: "get",
    path: "/",
    tags: ["Features"],
    summary: "List features",
    request: { query: listFeaturesQuerySchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(listFeaturesResponseSchema, "Paginated list of features"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/feature:list");
    const { search, limit, offset } = c.req.valid("query");
    const result = await listFeaturesService({ search, limit, offset });
    return c.json(result, 200);
  },
});
