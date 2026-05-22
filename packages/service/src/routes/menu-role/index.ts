import { OpenAPIHono } from "@hono/zod-openapi";
import { batchAssignMenus } from "./batchAssignMenus";
import { getMine } from "./getMine";
import { getRoleMenus } from "./getRoleMenus";

const menuRoleRoutes = new OpenAPIHono();

const routes = menuRoleRoutes.openapiRoutes([
  batchAssignMenus,
  getMine,
  getRoleMenus,
] as const);

export { routes as menuRoleRoutes };
