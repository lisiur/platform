import { OpenAPIHono } from "@hono/zod-openapi";
import { permissionRoutes } from "./access-control/routes/permission";
import { roleRoutes } from "./access-control/routes/role";
import { rolePermissionRoutes } from "./access-control/routes/role-permission";
import { userRoleRoutes } from "./access-control/routes/user-role";
import { agentRoutes } from "./agent/routes/agent";
import { applicationRoutes } from "./application/routes/application";
import { menuRoutes } from "./application/routes/menu";
import { attachmentRoutes } from "./attachment/routes/attachment";
import { auditLogRoutes } from "./audit/routes/audit-log";
import { operationLogRoutes } from "./audit/routes/operation-log";
import { eventsRoutes } from "./events/routes/events";
import { apiTokenRoutes } from "./identity/routes/api-token";
import { authRoutes } from "./identity/routes/auth";
import { userRoutes } from "./identity/routes/user";
import { jobRoutes } from "./jobs/routes/job";
import { jobInstanceRoutes } from "./jobs/routes/job-instance";
import { notificationRoutes } from "./notification/routes/notification";
import { notificationChannelRoutes } from "./notification/routes/notification-channel";
import { notificationRecordRoutes } from "./notification/routes/notification-record";
import { notificationTemplateRoutes } from "./notification/routes/notification-template";
import { organizationRoutes } from "./organization/routes/organization";
import { cacheRoutes } from "./system/routes/cache";
import { rateLimitRoutes } from "./system/routes/rate-limit";
import { systemConfigRoutes } from "./system/routes/system-config";
import { systemInfoRoutes } from "./system/routes/system-info";
import { versionRoutes } from "./system/routes/version";

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
  .route("/version", versionRoutes)
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
  .route("/cache", cacheRoutes)
  .route("/agent", agentRoutes);

export { routes };
