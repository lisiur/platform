import { OpenAPIHono } from "@hono/zod-openapi";
import { createAiKeyRoute } from "./createAiKey";
import { deleteAiKeyRoute } from "./deleteAiKey";
import { getAiKeyRoute } from "./getAiKey";
import { listAiKeysRoute } from "./listAiKeys";
import { updateAiKeyRoute } from "./updateAiKey";

const aiKeyRoutes = new OpenAPIHono();

const routes = aiKeyRoutes.openapiRoutes([
  listAiKeysRoute,
  createAiKeyRoute,
  getAiKeyRoute,
  updateAiKeyRoute,
  deleteAiKeyRoute,
] as const);

export { routes as aiKeyRoutes };
