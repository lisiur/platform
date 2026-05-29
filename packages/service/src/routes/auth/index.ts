import { OpenAPIHono } from "@hono/zod-openapi";
import { changePassword } from "./changePassword";
import { getSession } from "./getSession";
import { signInEmail } from "./signInEmail";
import { signOut } from "./signOut";
import { signUpEmail } from "./signUpEmail";
import { updateUser } from "./updateUser";

const authRoutes = new OpenAPIHono();

const routes = authRoutes.openapiRoutes([
  signInEmail,
  signUpEmail,
  signOut,
  getSession,
  updateUser,
  changePassword,
] as const);

export { routes as authRoutes };
