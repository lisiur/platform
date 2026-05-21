import { OpenAPIHono } from "@hono/zod-openapi";
import { applicationRoutes } from "./application";
import { authRoutes } from "./auth.routes";
import { menuRoutes } from "./menu";
import { menuRoleRoutes } from "./menu-role";
import { organizationRoutes } from "./organization";
import { systemConfigRoutes } from "./system-config";
import { uploadRoutes } from "./upload";

const routes = new OpenAPIHono()
  .route("/auth", authRoutes)
  .route("/system-config", systemConfigRoutes)
  .route("/organizations", organizationRoutes)
  .route("/applications", applicationRoutes)
  .route("/menu", menuRoutes)
  .route("/menu-role", menuRoleRoutes)
  .route("/upload", uploadRoutes);

export { routes };
