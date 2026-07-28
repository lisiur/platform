import { OpenAPIHono } from "@hono/zod-openapi";
import { assignRoleAssignment } from "./assignUserRole";
import { listRoleAssignments } from "./listUserRoles";
import { removeRoleAssignment } from "./removeUserRole";

const userRoleRoutes = new OpenAPIHono();

const routes = userRoleRoutes.openapiRoutes([
  assignRoleAssignment,
  removeRoleAssignment,
  listRoleAssignments,
] as const);

export { routes as userRoleRoutes };
