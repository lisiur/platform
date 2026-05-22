import { OpenAPIHono } from "@hono/zod-openapi";
import { assignUserRole } from "./assignUserRole";
import { getUserAppRoles } from "./getUserAppRoles";
import { listUserRoles } from "./listUserRoles";
import { removeUserRole } from "./removeUserRole";

const userRoleRoutes = new OpenAPIHono();

const routes = userRoleRoutes.openapiRoutes([
  assignUserRole,
  removeUserRole,
  listUserRoles,
  getUserAppRoles,
] as const);

export { routes as userRoleRoutes };
