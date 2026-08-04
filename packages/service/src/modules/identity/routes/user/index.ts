import { OpenAPIHono } from "@hono/zod-openapi";
import { createUser } from "./createUser";
import { deleteUser } from "./deleteUser";
import { listUsers } from "./listUsers";
import { resetPassword } from "./resetPassword";
import { updateUser } from "./updateUser";
import { uploadAvatar } from "./uploadAvatar";

const userRoutes = new OpenAPIHono();

const routes = userRoutes.openapiRoutes([
  listUsers,
  createUser,
  updateUser,
  resetPassword,
  deleteUser,
  uploadAvatar,
] as const);

export { routes as userRoutes };
