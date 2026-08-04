import { OpenAPIHono } from "@hono/zod-openapi";
import { listPermissionsRoute } from "./listPermissions";

const permissionRoutes = new OpenAPIHono();

const routes = permissionRoutes.openapiRoutes([listPermissionsRoute] as const);

export { routes as permissionRoutes };
