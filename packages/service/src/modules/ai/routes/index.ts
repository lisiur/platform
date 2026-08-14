import { OpenAPIHono } from "@hono/zod-openapi";
import { aiAccountRoutes } from "./ai-account";
import { aiAgentRoutes } from "./ai-agent";
import { aiKeyRoutes } from "./ai-key";
import { aiModelRoutes } from "./ai-model";
import { aiModelPricingRoutes } from "./ai-model-pricing";
import { aiProviderRoutes } from "./ai-provider";
import { aiUsageEventRoutes } from "./ai-usage-event";

const routes = new OpenAPIHono()
  .route("/providers", aiProviderRoutes)
  .route("/accounts", aiAccountRoutes)
  .route("/keys", aiKeyRoutes)
  .route("/models", aiModelRoutes)
  .route("/model-pricing", aiModelPricingRoutes)
  .route("/agents", aiAgentRoutes)
  .route("/usage-events", aiUsageEventRoutes);

export { routes as aiRoutes };
