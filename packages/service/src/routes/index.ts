import { OpenAPIHono } from "@hono/zod-openapi";
import { applicationRoutes } from "./application";
import { auditLogRoutes } from "./audit-log";
import { authRoutes } from "./auth";
import { menuRoutes } from "./menu";
import { notificationRoutes } from "./notification";
import { notificationChannelRoutes } from "./notification-channel";
import { notificationRecordRoutes } from "./notification-record";
import { notificationTemplateRoutes } from "./notification-template";
import { operationLogRoutes } from "./operation-log";
import { organizationRoutes } from "./organization";
import { permissionRoutes } from "./permission";
import { roleRoutes } from "./role";
import { rolePermissionRoutes } from "./role-permission";
import { systemConfigRoutes } from "./system-config";
import { systemInfoRoutes } from "./system-info";
import { uploadRoutes } from "./upload";
import { userRoutes } from "./user";
import { userRoleRoutes } from "./user-role";
import { jobRoutes } from "../queues/routes";

const routes = new OpenAPIHono()
  .route("/auth", authRoutes)
  .route("/system-config", systemConfigRoutes)
  .route("/organizations", organizationRoutes)
  .route("/applications", applicationRoutes)
  .route("/menus", menuRoutes)
  .route("/permissions", permissionRoutes)
  .route("/notification-channels", notificationChannelRoutes)
  .route("/notification-templates", notificationTemplateRoutes)
  .route("/notifications", notificationRoutes)
  .route("/notification-records", notificationRecordRoutes)
  .route("/roles", roleRoutes)
  .route("/role-permissions", rolePermissionRoutes)
  .route("/system-info", systemInfoRoutes)
  .route("/upload", uploadRoutes)
  .route("/user-roles", userRoleRoutes)
  .route("/operation-logs", operationLogRoutes)
  .route("/audit-logs", auditLogRoutes)
  .route("/users", userRoutes)
  .route("/jobs", jobRoutes);

export { routes };
