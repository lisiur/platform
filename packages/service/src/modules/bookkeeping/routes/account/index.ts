import { OpenAPIHono } from "@hono/zod-openapi";
import { createAccountRoute } from "./createAccount";
import { deleteAccountRoute } from "./deleteAccount";
import { listAccountsRoute } from "./listAccounts";
import { updateAccountRoute } from "./updateAccount";

const accountRoutes = new OpenAPIHono();

const routes = accountRoutes.openapiRoutes([
  listAccountsRoute,
  createAccountRoute,
  updateAccountRoute,
  deleteAccountRoute,
] as const);

export { routes as qianlaiAccountRoutes };
