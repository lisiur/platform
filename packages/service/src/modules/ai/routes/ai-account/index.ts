import { OpenAPIHono } from "@hono/zod-openapi";
import { createAiAccountRoute } from "./createAiAccount";
import { deleteAiAccountRoute } from "./deleteAiAccount";
import { getAiAccountRoute } from "./getAiAccount";
import { listAiAccountsRoute } from "./listAiAccounts";
import { updateAiAccountRoute } from "./updateAiAccount";

const aiAccountRoutes = new OpenAPIHono();

const routes = aiAccountRoutes.openapiRoutes([
  listAiAccountsRoute,
  createAiAccountRoute,
  getAiAccountRoute,
  updateAiAccountRoute,
  deleteAiAccountRoute,
] as const);

export { routes as aiAccountRoutes };
