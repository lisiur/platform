import { OpenAPIHono } from "@hono/zod-openapi";
import { apiTokenRoutes } from "./api-token";
import { applicationRoutes } from "./application";
import { attachmentRoutes } from "./attachment";
import { auditLogRoutes } from "./audit-log";
import { authRoutes } from "./auth";
import { cacheRoutes } from "./cache";
import { eventsRoutes } from "./events";
import { jobRoutes } from "./job";
import { jobInstanceRoutes } from "./job-instance";
import { menuRoutes } from "./menu";
import { notificationRoutes } from "./notification";
import { notificationChannelRoutes } from "./notification-channel";
import { notificationRecordRoutes } from "./notification-record";
import { notificationTemplateRoutes } from "./notification-template";
import { operationLogRoutes } from "./operation-log";
import { organizationRoutes } from "./organization";
import { permissionRoutes } from "./permission";
import { rateLimitRoutes } from "./rate-limit";
import { roleRoutes } from "./role";
import { rolePermissionRoutes } from "./role-permission";
import { systemConfigRoutes } from "./system-config";
import { systemInfoRoutes } from "./system-info";
import { userRoutes } from "./user";
import { userRoleRoutes } from "./user-role";

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
  .route("/attachment", attachmentRoutes)
  .route("/user-roles", userRoleRoutes)
  .route("/operation-logs", operationLogRoutes)
  .route("/audit-logs", auditLogRoutes)
  .route("/events", eventsRoutes)
  .route("/users", userRoutes)
  .route("/api-tokens", apiTokenRoutes)
  .route("/jobs", jobRoutes)
  .route("/job-instances", jobInstanceRoutes)
  .route("/rate-limit", rateLimitRoutes)
  .route("/cache", cacheRoutes);

export { routes };
