import { OpenAPIHono } from "@hono/zod-openapi";
import { getFeatureRoute } from "./getFeature";
import { listActiveFeaturesRoute } from "./listActiveFeatures";
import { listFeaturesRoute } from "./listFeatures";
import { updateFeatureRoute } from "./updateFeature";

const featureRoutes = new OpenAPIHono();

const routes = featureRoutes.openapiRoutes([
  listActiveFeaturesRoute,
  listFeaturesRoute,
  getFeatureRoute,
  updateFeatureRoute,
] as const);

export { routes as featureRoutes };
