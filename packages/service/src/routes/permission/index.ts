import { OpenAPIHono } from "@hono/zod-openapi";
import { listPermissions } from "./listPermissions";

const permissionRoutes = new OpenAPIHono();

const routes = permissionRoutes.openapiRoutes([listPermissions] as const);

export { routes as permissionRoutes };
