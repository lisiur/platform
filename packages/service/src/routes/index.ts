import { OpenAPIHono } from "@hono/zod-openapi";
import { applicationRoutes } from "./application";
import { auditLogRoutes } from "./audit-log";
import { authRoutes } from "./auth";
import { menuRoutes } from "./menu";
import { notificationChannelRoutes } from "./notification-channel";
import { notificationTemplateRoutes } from "./notification-template";
import { operationLogRoutes } from "./operation-log";
import { organizationRoutes } from "./organization";
import { roleRoutes } from "./role";
import { roleMenusRoutes } from "./role-menu";
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
  .route("/menus", menuRoutes)
  .route("/notification-channels", notificationChannelRoutes)
  .route("/notification-templates", notificationTemplateRoutes)
  .route("/roles", roleRoutes)
  .route("/role-menus", roleMenusRoutes)
  .route("/system-info", systemInfoRoutes)
  .route("/upload", uploadRoutes)
  .route("/user-roles", userRoleRoutes)
  .route("/operation-logs", operationLogRoutes)
  .route("/audit-logs", auditLogRoutes)
  .route("/users", userRoutes);

export { routes };
