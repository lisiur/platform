import { OpenAPIHono } from "@hono/zod-openapi";
import { createAiAgentRoute } from "./createAiAgent";
import { deleteAiAgentRoute } from "./deleteAiAgent";
import { getAiAgentRoute } from "./getAiAgent";
import { listAiAgentsRoute } from "./listAiAgents";
import { listAvailableAgentApisRoute } from "./listAvailableAgentApis";
import { updateAiAgentRoute } from "./updateAiAgent";

const aiAgentRoutes = new OpenAPIHono();

const routes = aiAgentRoutes.openapiRoutes([
  listAiAgentsRoute,
  createAiAgentRoute,
  listAvailableAgentApisRoute,
  getAiAgentRoute,
  updateAiAgentRoute,
  deleteAiAgentRoute,
] as const);

export { routes as aiAgentRoutes };
