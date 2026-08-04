import { OpenAPIHono } from "@hono/zod-openapi";
import { createMenu } from "./createMenu";
import { deleteMenu } from "./deleteMenu";
import { getMenu } from "./getMenu";
import { getMine } from "./getMine";
import { listMenus } from "./listMenus";
import { reorderMenus } from "./reorderMenus";
import { updateMenu } from "./updateMenu";

const menuRoutes = new OpenAPIHono();

const routes = menuRoutes.openapiRoutes([
  listMenus,
  getMine,
  getMenu,
  createMenu,
  updateMenu,
  deleteMenu,
  reorderMenus,
] as const);

export { routes as menuRoutes };
