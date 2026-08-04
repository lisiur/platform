import { OpenAPIHono } from "@hono/zod-openapi";
import { createApiToken } from "./createApiToken";
import { deleteApiToken } from "./deleteApiToken";
import { getApiToken } from "./getApiToken";
import { listApiTokens } from "./listApiTokens";
import { listAvailableScopes } from "./listAvailableScopes";
import { updateApiToken } from "./updateApiToken";
import { verifyApiToken } from "./verify";

const apiTokenRoutes = new OpenAPIHono();

const routes = apiTokenRoutes.openapiRoutes([
  listApiTokens,
  listAvailableScopes,
  verifyApiToken,
  createApiToken,
  getApiToken,
  updateApiToken,
  deleteApiToken,
] as const);

export { routes as apiTokenRoutes };
