import { createRoute, defineOpenAPIRoute, z } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { okResponseFn, unauthorizedResponse } from "#lib/openapi";
import { listActiveFeaturesForUser } from "#modules/pricing/public";

const activeFeatureSchema = z.object({
  code: z.string(),
  name: z.string(),
});

const activeFeaturesResponseSchema = z.object({
  features: activeFeatureSchema.array(),
});

export const listActiveFeaturesRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listActiveFeatures",
    method: "get",
    path: "/active",
    tags: ["Features"],
    summary: "List features active for the current user",
    responses: {
      ...unauthorizedResponse,
      ...okResponseFn(
        activeFeaturesResponseSchema,
        "Active features for the current user",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const features = await listActiveFeaturesForUser(userId);
    return c.json({ features }, 200);
  },
});
