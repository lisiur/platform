import { OpenAPIHono } from "@hono/zod-openapi";
import { createRole } from "./createRole";
import { deleteRole } from "./deleteRole";
import { listRoles } from "./listRoles";
import { updateRole } from "./updateRole";

const roleRoutes = new OpenAPIHono();

const routes = roleRoutes.openapiRoutes([
  listRoles,
  createRole,
  updateRole,
  deleteRole,
] as const);

export { routes as roleRoutes };
