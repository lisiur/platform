import { OpenAPIHono } from "@hono/zod-openapi";
import { createRealAccountRoute } from "./createRealAccount";
import { deleteRealAccountRoute } from "./deleteRealAccount";
import { listRealAccountsRoute } from "./listRealAccounts";
import { updateRealAccountRoute } from "./updateRealAccount";

const realAccountRoutes = new OpenAPIHono();

const routes = realAccountRoutes.openapiRoutes([
  listRealAccountsRoute,
  createRealAccountRoute,
  updateRealAccountRoute,
  deleteRealAccountRoute,
] as const);

export { routes as qianlaiRealAccountRoutes };
