import { OpenAPIHono } from "@hono/zod-openapi";
import { createAiProviderRoute } from "./createAiProvider";
import { deleteAiProviderRoute } from "./deleteAiProvider";
import { getAiProviderRoute } from "./getAiProvider";
import { listAiProvidersRoute } from "./listAiProviders";
import { updateAiProviderRoute } from "./updateAiProvider";

const aiProviderRoutes = new OpenAPIHono();

const routes = aiProviderRoutes.openapiRoutes([
  listAiProvidersRoute,
  createAiProviderRoute,
  getAiProviderRoute,
  updateAiProviderRoute,
  deleteAiProviderRoute,
] as const);

export { routes as aiProviderRoutes };
