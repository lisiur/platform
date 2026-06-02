import { OpenAPIHono } from "@hono/zod-openapi";
import { applicationRoutes } from "./application";
import { auditLogRoutes } from "./audit-log";
import { authRoutes } from "./auth";
import { menuRoutes } from "./menu";
import { operationLogRoutes } from "./operation-log";
import { organizationRoutes } from "./organization";
import { roleRoutes } from "./role";
import { roleMenusRoutes } from "./role-menus";
import { systemConfigRoutes } from "./system-config";
import { systemInfoRoutes } from "./system-info";
import { uploadRoutes } from "./upload";
import { userRoutes } from "./user";
import { userRoleRoutes } from "./user-role";

const routes = new OpenAPIHono()
  .route("/auth", authRoutes)
  .route("/system-config", systemConfigRoutes)
  .route("/organizations", organizationRoutes)
  .route("/applications", applicationRoutes)
  .route("/menu", menuRoutes)
  .route("/roles", roleRoutes)
  .route("/role-menus", roleMenusRoutes)
  .route("/system-info", systemInfoRoutes)
  .route("/upload", uploadRoutes)
  .route("/user-role", userRoleRoutes)
  .route("/operation-log", operationLogRoutes)
  .route("/audit-log", auditLogRoutes)
  .route("/users", userRoutes);

export { routes };
