import { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { auth } from "../../lib/auth";
import { createMenu } from "./createMenu";
import { deleteMenu } from "./deleteMenu";
import { getMenu } from "./getMenu";
import { listMenus } from "./listMenus";
import { reorderMenus } from "./reorderMenus";
import { updateMenu } from "./updateMenu";

const menuRoutes = new OpenAPIHono();

menuRoutes.use("*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user || session.user.role !== "admin") {
    throw new HTTPException(401, { message: "Admin access required" });
  }
  return next();
});

const routes = menuRoutes.openapiRoutes([
  listMenus,
  getMenu,
  createMenu,
  updateMenu,
  deleteMenu,
  reorderMenus,
] as const);

export { routes as menuRoutes };
