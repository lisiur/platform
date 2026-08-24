import { OpenAPIHono } from "@hono/zod-openapi";
import { createAccountRoute } from "./createAccount";
import { deleteAccountRoute } from "./deleteAccount";
import { listAccountsRoute } from "./listAccounts";
import { reorderAccountsRoute } from "./reorderAccounts";
import { setBalanceRoute } from "./setBalance";
import { updateAccountRoute } from "./updateAccount";

const accountRoutes = new OpenAPIHono();

const routes = accountRoutes.openapiRoutes([
  listAccountsRoute,
  createAccountRoute,
  reorderAccountsRoute,
  updateAccountRoute,
  deleteAccountRoute,
  setBalanceRoute,
] as const);

export { routes as qianlaiAccountRoutes };
