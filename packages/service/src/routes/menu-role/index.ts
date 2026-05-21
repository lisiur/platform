import { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { auth } from "../../lib/auth";
import { batchAssignMenus } from "./batchAssignMenus";
import { getMine } from "./getMine";
import { getRoleMenus } from "./getRoleMenus";

const adminRoutes = new OpenAPIHono();

adminRoutes.use("*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user || session.user.role !== "admin") {
    throw new HTTPException(401, { message: "Admin access required" });
  }
  return next();
});

const publicRoutes = new OpenAPIHono();

const adminPart = adminRoutes.openapiRoutes([
  batchAssignMenus,
  getRoleMenus,
] as const);

const publicPart = publicRoutes.openapiRoutes([getMine] as const);

const routes = publicPart.route("/", adminPart);

export { routes as menuRoleRoutes };
