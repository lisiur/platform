import { OpenAPIHono } from "@hono/zod-openapi";
import { batchAssignRolePermissions } from "./batchAssignRolePermissions";
import { getRolePermissions } from "./getRolePermissions";

const rolePermissionRoutes = new OpenAPIHono();

const routes = rolePermissionRoutes.openapiRoutes([
  getRolePermissions,
  batchAssignRolePermissions,
] as const);

export { routes as rolePermissionRoutes };
