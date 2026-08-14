import { OpenAPIHono } from "@hono/zod-openapi";
import { createAiModelRoute } from "./createAiModel";
import { deleteAiModelRoute } from "./deleteAiModel";
import { getAiModelRoute } from "./getAiModel";
import { listAiModelsRoute } from "./listAiModels";
import { updateAiModelRoute } from "./updateAiModel";

const aiModelRoutes = new OpenAPIHono();

const routes = aiModelRoutes.openapiRoutes([
  listAiModelsRoute,
  createAiModelRoute,
  getAiModelRoute,
  updateAiModelRoute,
  deleteAiModelRoute,
] as const);

export { routes as aiModelRoutes };
