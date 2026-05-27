import { OpenAPIHono } from "@hono/zod-openapi";
import { createUser } from "./createUser";
import { deleteUser } from "./deleteUser";
import { listUsers } from "./listUsers";
import { updateUser } from "./updateUser";

const adminUserRoutes = new OpenAPIHono();

const routes = adminUserRoutes.openapiRoutes([
  listUsers,
  createUser,
  updateUser,
  deleteUser,
] as const);

export { routes as adminUserRoutes };
