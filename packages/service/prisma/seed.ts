/**
 * ============================================================
 * SEED CONTRACT
 * ============================================================
 * This file defines the DESIRED STATE of all reference/config data.
 * Safe to run in production - only touches reference tables, never user data.
 *
 * Tables managed by seed (idempotent):
 *   Application, Permission, Menu, MenuPermission, Role,
 *   RolePermission, SystemConfig, NotificationChannel,
 *   NotificationTemplate
 *
 * Tables NOT touched by seed (user-owned):
 *   User*, Account*, RoleAssignment, Organization, Member,
 *   Invitation, Upload, Notification, AuditLog, OperationLog
 *   (* except built-in admin user creation)
 *
 * To add new reference data:
 *   1. Add definition to the appropriate section below
 *   2. Use stable unique keys (code, slug, etc.)
 *   3. Run `pnpm db:seed`
 * ============================================================
 */

import {
  ADMIN_APP_CODE,
  ADMIN_ROLE_CODE,
  BUILTIN_NOTIFICATION_FLAG,
  BUILTIN_ROLE_FLAG,
  BUILTIN_USER_FLAG,
  ORGANIZATION_APP_CODE,
  USER_ROLE_CODE,
} from "@repo/shared";
import { nextRunFromNow } from "../src/lib/cron";
import { provisionOrgRoles } from "../src/lib/org-role";
import { hashPassword } from "../src/lib/password";
import { Prisma, type PrismaClient } from "./generated/prisma/client";

// ============================================================
// 1. REFERENCE DATA DEFINITIONS
// ============================================================

// --- System Configs ---
const systemConfigs = [
  {
    group: "auth",
    key: "registration.enabled",
    value: "true",
    type: "boolean",
    label: "settings.fields.enableRegistration",
    description: "settings.fieldsDesc.enableRegistration",
    isSecret: false,
    sortOrder: 0,
  },
  {
    group: "auth",
    key: "session.maxAge",
    // Value is in SECONDS (604800 = 7 days). Honors AUTH_SESSION_MAX_AGE env.
    value: "604800",
    type: "number",
    label: "settings.fields.sessionMaxAge",
    description: "settings.fieldsDesc.sessionMaxAge",
    isSecret: false,
    sortOrder: 1,
  },
  {
    group: "wechat",
    key: "appid",
    value: "",
    type: "string",
    label: "settings.fields.wechatAppid",
    description: "settings.fieldsDesc.wechatAppid",
    isSecret: false,
    sortOrder: 0,
  },
  {
    group: "wechat",
    key: "secret",
    value: "",
    type: "string",
    label: "settings.fields.wechatSecret",
    description: "settings.fieldsDesc.wechatSecret",
    isSecret: true,
    mask: "start{4}.{*}",
    sortOrder: 1,
  },
  {
    group: "webauthn",
    key: "enabled",
    value: "",
    type: "boolean",
    label: "settings.fields.webauthnEnabled",
    description: "settings.fieldsDesc.webauthnEnabled",
    isSecret: false,
    sortOrder: 0,
  },
  {
    group: "webauthn",
    key: "rp.name",
    value: "",
    type: "string",
    label: "settings.fields.webauthnRpName",
    description: "settings.fieldsDesc.webauthnRpName",
    isSecret: false,
    sortOrder: 1,
  },
  {
    group: "webauthn",
    key: "rp.id",
    value: "",
    type: "string",
    label: "settings.fields.webauthnRpId",
    description: "settings.fieldsDesc.webauthnRpId",
    isSecret: false,
    sortOrder: 2,
  },
  {
    group: "webauthn",
    key: "origin",
    value: "",
    type: "string",
    label: "settings.fields.webauthnOrigin",
    description: "settings.fieldsDesc.webauthnOrigin",
    isSecret: false,
    sortOrder: 3,
  },
  {
    group: "upload",
    key: "hotlink",
    value: JSON.stringify({
      enabled: false,
      allowedDomains: [],
      allowEmptyReferer: true,
    }),
    type: "json",
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
      required: ["enabled", "allowedDomains", "allowEmptyReferer"],
      properties: {
        enabled: {
          type: "boolean",
          title: "settings.fields.uploadHotlinkEnabled",
          default: false,
        },
        allowedDomains: {
          type: "array",
          title: "settings.fields.uploadHotlinkAllowedDomains",
          description: "settings.fieldsDesc.uploadHotlinkAllowedDomains",
          items: { type: "string" },
          default: [],
        },
        allowEmptyReferer: {
          type: "boolean",
          title: "settings.fields.uploadHotlinkAllowEmptyReferer",
          description: "settings.fieldsDesc.uploadHotlinkAllowEmptyReferer",
          default: true,
        },
      },
    },
    label: "settings.fields.uploadHotlink",
    description: "settings.fieldsDesc.uploadHotlink",
    isSecret: false,
    sortOrder: 0,
  },
  {
    group: "rate-limit",
    key: "enabled",
    value: "true",
    type: "boolean",
    label: "settings.fields.rateLimitEnabled",
    description: "settings.fieldsDesc.rateLimitEnabled",
    isSecret: false,
    sortOrder: 0,
  },
  {
    group: "rate-limit",
    key: "global.max",
    value: "300",
    type: "number",
    label: "settings.fields.rateLimitGlobalMax",
    description: "settings.fieldsDesc.rateLimitGlobalMax",
    isSecret: false,
    sortOrder: 1,
  },
  {
    group: "rate-limit",
    key: "global.windowMs",
    value: "60000",
    type: "number",
    label: "settings.fields.rateLimitGlobalWindowMs",
    description: "settings.fieldsDesc.rateLimitGlobalWindowMs",
    isSecret: false,
    sortOrder: 2,
  },
  {
    group: "rate-limit",
    key: "auth.max",
    value: "10",
    type: "number",
    label: "settings.fields.rateLimitAuthMax",
    description: "settings.fieldsDesc.rateLimitAuthMax",
    isSecret: false,
    sortOrder: 3,
  },
  {
    group: "rate-limit",
    key: "auth.windowMs",
    value: "60000",
    type: "number",
    label: "settings.fields.rateLimitAuthWindowMs",
    description: "settings.fieldsDesc.rateLimitAuthWindowMs",
    isSecret: false,
    sortOrder: 4,
  },
  {
    group: "rate-limit",
    key: "trustProxy",
    value: "uniqueLocal,loopback,linkLocal",
    type: "string",
    label: "settings.fields.rateLimitTrustProxy",
    description: "settings.fieldsDesc.rateLimitTrustProxy",
    isSecret: false,
    sortOrder: 5,
  },
];

/**
 * AI Agent config field definitions. Seeded per-application (each app gets its
 * own baseURL/apiKey/model/reasoning) under the application_config
 * table. Labels/descriptions reuse the shared `settings.*` i18n keys.
 */
const aiAgentConfigFields = [
  {
    group: "ai-agent",
    key: "baseURL",
    value: "",
    type: "string",
    label: "settings.fields.aiAgentBaseURL",
    description: "settings.fieldsDesc.aiAgentBaseURL",
    isSecret: false,
    sortOrder: 0,
  },
  {
    group: "ai-agent",
    key: "apiKey",
    value: "",
    type: "string",
    label: "settings.fields.aiAgentApiKey",
    description: "settings.fieldsDesc.aiAgentApiKey",
    isSecret: true,
    mask: "start{4}.{*}end{4}",
    sortOrder: 1,
  },
  {
    group: "ai-agent",
    key: "model",
    value: "",
    type: "string",
    label: "settings.fields.aiAgentModel",
    description: "settings.fieldsDesc.aiAgentModel",
    isSecret: false,
    sortOrder: 2,
  },
  {
    group: "ai-agent",
    key: "reasoning",
    value: "",
    type: "select",
    label: "settings.fields.aiAgentReasoning",
    description: "settings.fieldsDesc.aiAgentReasoning",
    schema: {
      options: [
        { value: "off", label: "settings.aiAgentReasoningOptions.off" },
        { value: "minimal", label: "settings.aiAgentReasoningOptions.minimal" },
        { value: "low", label: "settings.aiAgentReasoningOptions.low" },
        { value: "medium", label: "settings.aiAgentReasoningOptions.medium" },
        { value: "high", label: "settings.aiAgentReasoningOptions.high" },
        { value: "xhigh", label: "settings.aiAgentReasoningOptions.xhigh" },
      ],
    },
    isSecret: false,
    sortOrder: 3,
  },
];

// --- System Permissions (appId: null) ---
const systemPermissions = [
  {
    code: "system/system-config:list",
    group: "system-config",
    name: "List System Configs",
  },
  {
    code: "system/system-config:listByGroup",
    group: "system-config",
    name: "List System Configs by Group",
  },
  {
    code: "system/system-config:upsert",
    group: "system-config",
    name: "Upsert System Config",
  },
  {
    code: "system/system-config:batchUpsert",
    group: "system-config",
    name: "Batch Upsert System Configs",
  },
  {
    code: "system/system-config:delete",
    group: "system-config",
    name: "Delete System Config",
  },
  {
    code: "system/system-info:view",
    group: "system-info",
    name: "View System Info",
  },
  {
    code: "system/rate-limit:manage",
    group: "rate-limit",
    name: "Manage Rate Limits",
  },
  { code: "system/cache:view", group: "cache", name: "View Cache" },
  { code: "system/cache:manage", group: "cache", name: "Manage Cache" },
  { code: "system/agent:manage", group: "agent", name: "Manage AI Agent" },
  { code: "system/agent:chat", group: "agent", name: "Use AI Agent" },
  { code: "system/user:list", group: "user", name: "List Users" },
  { code: "system/user:create", group: "user", name: "Create User" },
  { code: "system/user:update", group: "user", name: "Update User" },
  { code: "system/user:delete", group: "user", name: "Delete User" },
  { code: "system/role:list", group: "role", name: "List Roles" },
  { code: "system/role:create", group: "role", name: "Create Role" },
  { code: "system/role:update", group: "role", name: "Update Role" },
  { code: "system/role:delete", group: "role", name: "Delete Role" },
  {
    code: "system/permission:list",
    group: "permission",
    name: "List Permissions",
  },
  {
    code: "system/permission:view",
    group: "permission",
    name: "View Permission",
  },
  {
    code: "system/user-role:list",
    group: "user-role",
    name: "List User-Role Assignments",
  },
  {
    code: "system/user-role:assign",
    group: "user-role",
    name: "Assign Role to User",
  },
  {
    code: "system/user-role:remove",
    group: "user-role",
    name: "Remove Role from User",
  },
  { code: "system/menu:list", group: "menu", name: "List Menus" },
  { code: "system/menu:view", group: "menu", name: "View Menu" },
  { code: "system/menu:create", group: "menu", name: "Create Menu" },
  { code: "system/menu:update", group: "menu", name: "Update Menu" },
  { code: "system/menu:delete", group: "menu", name: "Delete Menu" },
  { code: "system/menu:reorder", group: "menu", name: "Reorder Menus" },
  {
    code: "system/application:list",
    group: "application",
    name: "List Applications",
  },
  {
    code: "system/application:view",
    group: "application",
    name: "View Application",
  },
  {
    code: "system/application:update",
    group: "application",
    name: "Update Application",
  },
  {
    code: "system/organization:list",
    group: "organization",
    name: "List Organizations",
  },
  {
    code: "system/organization:view",
    group: "organization",
    name: "View Organization",
  },
  {
    code: "system/organization:create",
    group: "organization",
    name: "Create Organization",
  },
  {
    code: "system/organization:update",
    group: "organization",
    name: "Update Organization",
  },
  {
    code: "system/organization:delete",
    group: "organization",
    name: "Delete Organization",
  },
  {
    code: "system/audit-log:list",
    group: "audit-log",
    name: "List Audit Logs",
  },
  { code: "system/audit-log:view", group: "audit-log", name: "View Audit Log" },
  {
    code: "system/operation-log:list",
    group: "operation-log",
    name: "List Operation Logs",
  },
  {
    code: "system/operation-log:view",
    group: "operation-log",
    name: "View Operation Log",
  },
  {
    code: "system/operation-log:delete",
    group: "operation-log",
    name: "Delete Operation Logs",
  },
  {
    code: "system/notification-channel:list",
    group: "notification-channel",
    name: "List Notification Channels",
  },
  {
    code: "system/notification-channel:view",
    group: "notification-channel",
    name: "View Notification Channel",
  },
  {
    code: "system/notification-channel:update",
    group: "notification-channel",
    name: "Update Notification Channel",
  },
  {
    code: "system/notification-template:list",
    group: "notification-template",
    name: "List Notification Templates",
  },
  {
    code: "system/notification-template:view",
    group: "notification-template",
    name: "View Notification Template",
  },
  {
    code: "system/notification-template:update",
    group: "notification-template",
    name: "Update Notification Template",
  },
  {
    code: "system/notification-template:test",
    group: "notification-template",
    name: "Test Notification Template",
  },
  {
    code: "system/notification:list",
    group: "notification",
    name: "List Notifications",
  },
  {
    code: "system/notification:view",
    group: "notification",
    name: "View Notification",
  },
  {
    code: "system/notification-record:list",
    group: "notification-record",
    name: "List Notification Records",
  },
  {
    code: "system/notification-record:view",
    group: "notification-record",
    name: "View Notification Record",
  },
  {
    code: "system/attachment:sign",
    group: "attachment",
    name: "Sign Attachment URL",
  },
  {
    code: "system/attachment:list",
    group: "attachment",
    name: "List Attachments",
  },
  {
    code: "system/attachment:delete",
    group: "attachment",
    name: "Delete Attachments",
  },
  {
    code: "system/attachment:replace",
    group: "attachment",
    name: "Replace Attachment",
  },
  {
    code: "system/attachment:manage-all",
    group: "attachment",
    name: "Manage All Users' Attachments",
  },
  { code: "system/job:list", group: "job", name: "List Jobs" },
  { code: "system/job:create", group: "job", name: "Create Job" },
  { code: "system/job:view", group: "job", name: "View Job" },
  { code: "system/job:cancel", group: "job", name: "Cancel Job" },
];

// --- Organization App Permissions ---
const organizationPermissions = [
  {
    code: "org/dashboard:view",
    group: "dashboard",
    name: "View Dashboard",
    description: "View the organization dashboard",
  },
  {
    code: "org/agent:chat",
    group: "agent",
    name: "Use AI Agent",
    description: "Use the AI Agent assistant",
  },
  {
    code: "org/organization-member:list",
    group: "organization-member",
    name: "List Organization Members",
    description: "List members of an organization",
  },
  {
    code: "org/organization-member:remove",
    group: "organization-member",
    name: "Remove Organization Member",
    description: "Remove a member from an organization",
  },
  {
    code: "org/organization-member:update",
    group: "organization-member",
    name: "Update Organization Member",
    description: "Update an organization member's department assignment",
  },
  {
    code: "org/organization-settings:view",
    group: "organization-settings",
    name: "View Organization Settings",
    description: "View an organization's settings",
  },
  {
    code: "org/organization-settings:update",
    group: "organization-settings",
    name: "Update Organization Settings",
    description: "Update an organization's settings",
  },
  {
    code: "org/department:list",
    group: "department",
    name: "List Departments",
    description: "List departments in an organization",
  },
  {
    code: "org/department:create",
    group: "department",
    name: "Create Department",
    description: "Create a department in an organization",
  },
  {
    code: "org/department:update",
    group: "department",
    name: "Update Department",
    description: "Update a department in an organization",
  },
  {
    code: "org/department:delete",
    group: "department",
    name: "Delete Department",
    description: "Delete a department from an organization",
  },
  {
    code: "org/position:list",
    group: "position",
    name: "List Positions",
    description: "List positions in an organization",
  },
  {
    code: "org/position:create",
    group: "position",
    name: "Create Position",
    description: "Create a position in an organization",
  },
  {
    code: "org/position:update",
    group: "position",
    name: "Update Position",
    description: "Update a position in an organization",
  },
  {
    code: "org/position:delete",
    group: "position",
    name: "Delete Position",
    description: "Delete a position from an organization",
  },
  {
    code: "org/position-permission:manage",
    group: "position-permission",
    name: "Manage Position Permissions",
    description: "Assign permissions to positions in an organization",
  },
];

// --- Applications ---
const applications = [
  {
    code: ADMIN_APP_CODE,
    name: "Admin Panel",
    description: "Administrative dashboard application",
  },
  {
    code: ORGANIZATION_APP_CODE,
    name: "Organization",
    description: "Organization workspace application",
  },
];

// --- Admin App Menus ---
const adminMenus = [
  // Platform Group
  {
    id: "platform",
    code: "platform",
    name: "Platform",
    icon: "ShieldCheck",
    linkType: "GROUP" as const,
    url: null,
    sortOrder: 0,
    permissions: [],
  },
  {
    id: "applications",
    code: "applications",
    name: "Applications",
    icon: "Layers",
    linkType: "INTERNAL" as const,
    url: "/admin/applications",
    parentId: "platform",
    sortOrder: 1,
    permissions: ["system/application:list"],
  },
  {
    id: "organizations",
    code: "organizations",
    name: "Organizations",
    icon: "Building2",
    linkType: "INTERNAL" as const,
    url: "/admin/organizations",
    parentId: "platform",
    sortOrder: 2,
    permissions: ["system/organization:list"],
  },
  {
    id: "users",
    code: "users",
    name: "Users",
    icon: "User",
    linkType: "INTERNAL" as const,
    url: "/admin/users",
    parentId: "platform",
    sortOrder: 3,
    permissions: ["system/user:list"],
  },
  {
    id: "roles",
    code: "roles",
    name: "Roles",
    icon: "Users",
    linkType: "INTERNAL" as const,
    url: "/admin/roles",
    parentId: "platform",
    sortOrder: 4,
    permissions: ["system/role:list"],
  },
  {
    id: "menus",
    code: "menus",
    name: "Menus",
    icon: "Menu",
    linkType: "INTERNAL" as const,
    url: "/admin/menus",
    parentId: "platform",
    sortOrder: 5,
    permissions: ["system/menu:list"],
  },
  // Infrastructure Group
  {
    id: "infrastructure",
    code: "infrastructure",
    name: "Infrastructure",
    icon: "Cog",
    linkType: "GROUP" as const,
    url: null,
    sortOrder: 6,
    permissions: [],
  },
  {
    id: "notifications",
    code: "notifications",
    name: "Notifications",
    icon: "Bell",
    linkType: "INTERNAL" as const,
    url: "/admin/notifications",
    parentId: "infrastructure",
    sortOrder: 7,
    permissions: ["system/notification:list"],
  },
  {
    id: "rate-limit",
    code: "rate-limit",
    name: "Rate Limit",
    icon: "Timer",
    linkType: "INTERNAL" as const,
    url: "/admin/rate-limit",
    parentId: "infrastructure",
    sortOrder: 8,
    permissions: ["system/rate-limit:manage"],
  },
  {
    id: "attachments",
    code: "attachments",
    name: "Attachments",
    icon: "Upload",
    linkType: "INTERNAL" as const,
    url: "/admin/attachments",
    parentId: "infrastructure",
    sortOrder: 9,
    permissions: ["system/attachment:list"],
  },
  {
    id: "settings",
    code: "settings",
    name: "Settings",
    icon: "Settings",
    linkType: "INTERNAL" as const,
    url: "/admin/settings",
    parentId: "infrastructure",
    sortOrder: 10,
    permissions: ["system/system-config:list"],
  },
  // Developer Group
  {
    id: "developer",
    code: "developer",
    name: "Developer",
    icon: "ServerCog",
    linkType: "GROUP" as const,
    url: null,
    sortOrder: 11,
    permissions: [],
  },
  {
    id: "monitor",
    code: "monitor",
    name: "Monitor",
    icon: "Gauge",
    linkType: "INTERNAL" as const,
    url: "/admin/monitor",
    parentId: "developer",
    sortOrder: 12,
    permissions: ["system/system-info:view"],
  },
  {
    id: "logs",
    code: "logs",
    name: "Logs",
    icon: "FileText",
    linkType: "INTERNAL" as const,
    url: "/admin/logs",
    parentId: "developer",
    sortOrder: 13,
    permissions: ["system/audit-log:list", "system/operation-log:list"],
  },
  {
    id: "jobs",
    code: "jobs",
    name: "Jobs",
    icon: "CalendarCheck",
    linkType: "INTERNAL" as const,
    url: "/admin/jobs",
    parentId: "developer",
    sortOrder: 14,
    permissions: ["system/job:list"],
  },
  {
    id: "cache",
    code: "cache",
    name: "Cache",
    icon: "Database",
    linkType: "INTERNAL" as const,
    url: "/admin/cache",
    parentId: "developer",
    sortOrder: 15,
    permissions: ["system/cache:view"],
  },
];

// --- Organization App Menus ---
const organizationMenus = [
  {
    id: "organization-dashboard",
    code: "dashboard",
    name: "Dashboard",
    icon: "LayoutDashboard",
    linkType: "INTERNAL" as const,
    url: "/organization/dashboard",
    sortOrder: 0,
    permissions: ["org/dashboard:view"],
  },
  {
    id: "organization-members",
    code: "members",
    name: "Members",
    icon: "Users",
    linkType: "INTERNAL" as const,
    url: "/organization/members",
    sortOrder: 1,
    permissions: ["org/organization-member:list"],
  },
  {
    id: "organization-positions",
    code: "positions",
    name: "Positions",
    icon: "Crown",
    linkType: "INTERNAL" as const,
    url: "/organization/positions",
    sortOrder: 2,
    permissions: ["org/position:list"],
  },
  {
    id: "organization-departments",
    code: "departments",
    name: "Departments",
    icon: "FolderTree",
    linkType: "INTERNAL" as const,
    url: "/organization/departments",
    sortOrder: 3,
    permissions: ["org/department:list"],
  },
  {
    id: "organization-settings",
    code: "settings",
    name: "Settings",
    icon: "Settings",
    linkType: "INTERNAL" as const,
    url: "/organization/settings",
    sortOrder: 4,
    permissions: ["org/organization-settings:view"],
  },
];

// --- Roles ---
const adminRoles = [
  { code: ADMIN_ROLE_CODE, name: "Administrator", flags: [BUILTIN_ROLE_FLAG] },
  { code: USER_ROLE_CODE, name: "User", flags: [BUILTIN_ROLE_FLAG] },
];

// Organization roles (owner/member) are NOT global templates — they are
// provisioned per-org-instance when an organization is created (see
// provisionOrgRoles). Owner receives all `org/...` permissions; member receives
// ORG_MEMBER_PERMISSION_CODES (defined in lib/org-role.ts).

// --- Role -> Permission mappings (by role code) ---
const adminRolePermissions: Record<string, string[]> = {
  [ADMIN_ROLE_CODE]: systemPermissions.map((p) => p.code),
  [USER_ROLE_CODE]: ["system/attachment:sign"],
};

// --- Notification Channels ---
const notificationChannels = [
  { key: "in-app", name: "In-App", providerKey: "in-app", enabled: true },
  {
    key: "smtp-email",
    name: "Email",
    providerKey: "smtp-email",
    enabled: false,
  },
  {
    key: "sms",
    name: "SMS",
    providerKey: "sms",
    enabled: false,
  },
];

// --- Notification Templates (keyed by channel key) ---
const notificationTemplates = [
  {
    channelKey: "in-app",
    key: "welcome-in-app",
    name: "Welcome In-App",
    enabled: true,
    titleTemplate: "Welcome, {{userName}}!",
    bodyTemplate: "Your account has been created successfully.",
    variablesSchema: {
      properties: {
        userName: { type: "string", description: "The user's name" },
      },
      required: ["userName"],
    },
  },
  {
    channelKey: "smtp-email",
    key: "welcome-email",
    name: "Welcome Email",
    enabled: false,
    subjectTemplate: "Welcome to {{siteName}}!",
    bodyTemplate:
      "<p>Hi {{userName}},</p><p>Welcome to <strong>{{siteName}}</strong>! Your account has been created successfully.</p><p>We're glad to have you on board.</p><p>— The {{siteName}} Team</p>",
    variablesSchema: {
      properties: {
        userName: { type: "string", description: "The user's name" },
        siteName: { type: "string", description: "The site name" },
      },
      required: ["userName", "siteName"],
    },
  },
  {
    channelKey: "sms",
    key: "welcome-sms",
    name: "Welcome SMS",
    enabled: false,
    bodyTemplate:
      "Hi {{userName}}, your {{siteName}} account is ready. Welcome aboard!",
    variablesSchema: {
      properties: {
        userName: { type: "string", description: "The user's name" },
        siteName: { type: "string", description: "The site name" },
      },
      required: ["userName", "siteName"],
    },
  },
];

// --- Built-in Users ---
const builtInUsers = [
  {
    id: "admin",
    name: "Admin",
    email: "admin@system.local",
    password: "admin123",
    flags: [BUILTIN_USER_FLAG],
    roleCode: ADMIN_ROLE_CODE,
  },
  {
    id: "hapaul",
    name: "Hapaul",
    email: "hapaul@system.local",
    password: "hapaul123",
    flags: [BUILTIN_USER_FLAG],
    roleCode: USER_ROLE_CODE,
  },
];

// --- Built-in Job Templates ---
const builtInJobTemplates = [
  {
    name: "session-sweep",
    type: "session-sweep",
    description: "Delete expired and revoked session rows",
    cronExpression: "0 * * * *",
  },
  {
    name: "job-instance-sweep",
    type: "job-instance-sweep",
    description: "Delete completed/failed job instances older than 30 days",
    cronExpression: "0 3 * * *",
  },
  {
    name: "verification-sweep",
    type: "verification-sweep",
    description: "Delete expired verification rows",
    cronExpression: "30 * * * *",
  },
  {
    name: "operation-log-sweep",
    type: "operation-log-sweep",
    description: "Delete operation logs older than 30 days",
    cronExpression: "15 3 * * *",
  },
  {
    name: "audit-log-sweep",
    type: "audit-log-sweep",
    description: "Delete audit logs older than 180 days",
    cronExpression: "30 3 * * *",
  },
];

// ============================================================
// 2. DATABASE CLIENT
// ============================================================

// Assigned from the parameter passed to seed(). Kept at module scope so the
// upsert helpers below can reference it without each needing a parameter.
let prisma: PrismaClient;

// ============================================================
// 3. GENERIC UPSERT HELPERS (idempotent)
// ============================================================

async function upsertApplication(data: {
  code: string;
  name: string;
  description: string;
}) {
  console.log(`  Application: ${data.code}`);
  return prisma.application.upsert({
    where: { code: data.code },
    update: { name: data.name, description: data.description },
    create: {
      id: data.code,
      code: data.code,
      name: data.name,
      description: data.description,
    },
  });
}

async function upsertPermission(data: {
  code: string;
  name: string;
  group: string;
  description?: string;
}) {
  const existing = await prisma.permission.findUnique({
    where: { code: data.code },
  });

  if (existing) {
    return prisma.permission.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        group: data.group,
        description: data.description,
      },
    });
  }

  return prisma.permission.create({
    data: {
      code: data.code,
      name: data.name,
      group: data.group,
      description: data.description,
    },
  });
}

async function upsertPermissions(
  definitions: {
    code: string;
    name: string;
    group: string;
    description?: string;
  }[],
) {
  const ids: Record<string, string> = {};
  for (const def of definitions) {
    const perm = await upsertPermission(def);
    ids[def.code] = perm.id;
  }
  return ids;
}

async function upsertMenu(
  appId: string,
  data: {
    id: string;
    code: string;
    name: string;
    icon?: string | null;
    linkType: "GROUP" | "INTERNAL" | "EXTERNAL";
    url?: string | null;
    sortOrder: number;
    parentId?: string | null;
  },
) {
  return prisma.menu.upsert({
    where: { id: data.id },
    update: {
      name: data.name,
      icon: data.icon ?? null,
      linkType: data.linkType,
      url: data.url ?? null,
      sortOrder: data.sortOrder,
      parentId: data.parentId ?? null,
    },
    create: {
      id: data.id,
      appId,
      code: data.code,
      name: data.name,
      icon: data.icon ?? null,
      linkType: data.linkType,
      url: data.url ?? null,
      sortOrder: data.sortOrder,
      parentId: data.parentId ?? null,
    },
  });
}

async function linkMenuPermissions(
  menuId: string,
  permissionCodes: string[],
  permissionLookup: Record<string, string>,
) {
  for (const code of permissionCodes) {
    const permissionId = permissionLookup[code];
    if (!permissionId) {
      console.warn(`  [seed] Permission not found for menu link: ${code}`);
      continue;
    }
    await prisma.menuPermission.upsert({
      where: { menuId_permissionId: { menuId, permissionId } },
      update: {},
      create: { menuId, permissionId },
    });
  }
}

async function upsertRole(data: {
  code: string;
  name: string;
  flags: string[];
}) {
  return prisma.role.upsert({
    where: { code: data.code },
    update: { name: data.name, flags: data.flags },
    create: { code: data.code, name: data.name, flags: data.flags },
  });
}

async function upsertRolePermissions(roleId: string, permissionIds: string[]) {
  for (const permissionId of permissionIds) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId } },
      update: {},
      create: { roleId, permissionId },
    });
  }
}

async function upsertSystemConfig(data: {
  group: string;
  key: string;
  value: string;
  type: string;
  label: string;
  description: string;
  isSecret: boolean;
  sortOrder: number;
  schema?: object;
  mask?: string | null;
}) {
  return prisma.systemConfig.upsert({
    where: { group_key: { group: data.group, key: data.key } },
    update: {
      value: data.value,
      type: data.type,
      schema: data.schema,
      label: data.label,
      description: data.description,
      isSecret: data.isSecret,
      mask: data.mask,
      sortOrder: data.sortOrder,
    },
    create: data,
  });
}

async function upsertApplicationConfig(
  appId: string,
  data: {
    group: string;
    key: string;
    value: string;
    type: string;
    label: string;
    description: string;
    isSecret: boolean;
    sortOrder: number;
    schema?: object;
    mask?: string | null;
  },
) {
  return prisma.applicationConfig.upsert({
    where: { appId_group_key: { appId, group: data.group, key: data.key } },
    update: {
      value: data.value,
      type: data.type,
      schema: data.schema,
      label: data.label,
      description: data.description,
      isSecret: data.isSecret,
      mask: data.mask,
      sortOrder: data.sortOrder,
    },
    create: { appId, ...data },
  });
}

async function upsertJobTemplate(data: {
  name: string;
  type: string;
  description: string;
  cronExpression: string;
}) {
  const nextRunAt = nextRunFromNow(data.cronExpression);
  const existing = await prisma.job.findUnique({ where: { name: data.name } });
  if (existing) {
    return prisma.job.update({
      where: { name: data.name },
      data: {
        type: data.type,
        description: data.description,
        cronExpression: data.cronExpression,
        enabled: true,
        nextRunAt: existing.enabled ? existing.nextRunAt : nextRunAt,
      },
    });
  }
  return prisma.job.create({
    data: {
      name: data.name,
      type: data.type,
      description: data.description,
      cronExpression: data.cronExpression,
      enabled: true,
      nextRunAt,
    },
  });
}

async function upsertNotificationChannel(data: {
  key: string;
  name: string;
  providerKey: string;
  enabled: boolean;
}) {
  return prisma.notificationChannel.upsert({
    where: { key: data.key },
    update: {
      name: data.name,
      providerKey: data.providerKey,
      enabled: data.enabled,
      config: Prisma.JsonNull,
      flags: { set: [BUILTIN_NOTIFICATION_FLAG] },
    },
    create: { ...data, flags: [BUILTIN_NOTIFICATION_FLAG] },
  });
}

async function upsertNotificationTemplate(
  channelId: string,
  data: {
    key: string;
    name: string;
    description?: string;
    enabled: boolean;
    subjectTemplate?: string;
    titleTemplate?: string;
    bodyTemplate: string;
    variablesSchema: object;
    sampleVariables?: object;
  },
) {
  return prisma.notificationTemplate.upsert({
    where: { key: data.key },
    update: {
      channelId,
      name: data.name,
      description: data.description ?? null,
      enabled: data.enabled,
      subjectTemplate: data.subjectTemplate ?? null,
      titleTemplate: data.titleTemplate ?? null,
      bodyTemplate: data.bodyTemplate,
      variablesSchema: data.variablesSchema,
      sampleVariables: (data.sampleVariables ?? Prisma.JsonNull) as object,
      flags: { set: [BUILTIN_NOTIFICATION_FLAG] },
    },
    create: {
      key: data.key,
      channelId,
      name: data.name,
      description: data.description,
      enabled: data.enabled,
      subjectTemplate: data.subjectTemplate,
      titleTemplate: data.titleTemplate,
      bodyTemplate: data.bodyTemplate,
      variablesSchema: data.variablesSchema,
      sampleVariables: (data.sampleVariables ?? Prisma.JsonNull) as object,
      flags: [BUILTIN_NOTIFICATION_FLAG],
    },
  });
}

async function upsertUser(params: {
  id: string;
  name: string;
  email: string;
  password: string;
  flags: string[];
  roleCode?: string;
}) {
  const user = await prisma.user.upsert({
    where: { email: params.email },
    update: { flags: params.flags },
    create: {
      id: params.id,
      name: params.name,
      email: params.email,
      emailVerified: true,
      flags: params.flags,
    },
  });

  const hashedPassword = await hashPassword(params.password);
  const existingAccount = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
  });

  if (existingAccount) {
    await prisma.account.update({
      where: { id: existingAccount.id },
      data: { providerData: { password: hashedPassword } },
    });
  } else {
    await prisma.account.create({
      data: {
        accountId: params.email.toLowerCase(),
        providerId: "credential",
        userId: user.id,
        providerData: { password: hashedPassword },
      },
    });
  }

  console.log(`  User: ${params.email}`);
  return user;
}

async function upsertRoleAssignment(params: {
  userId: string;
  roleCode: string;
}) {
  const role = await prisma.role.findUnique({
    where: { code: params.roleCode },
  });
  if (!role) {
    console.warn(
      `  [seed] Role not found for assignment: code=${params.roleCode}`,
    );
    return;
  }
  await prisma.roleAssignment.upsert({
    where: {
      userId_roleId: {
        userId: params.userId,
        roleId: role.id,
      },
    },
    update: {},
    create: {
      userId: params.userId,
      roleId: role.id,
    },
  });
}

// ============================================================
// 4. MAIN SEED (orchestrates desired state)
// ============================================================

export async function seed(client: PrismaClient) {
  prisma = client;

  // 1. System Configs
  console.log("System configs:");
  for (const config of systemConfigs) {
    await upsertSystemConfig(config);
  }
  console.log(`  ${systemConfigs.length} configs ready.\n`);

  // 2. Notification Channels
  console.log("Notification channels:");
  for (const ch of notificationChannels) {
    await upsertNotificationChannel(ch);
  }
  console.log(`  ${notificationChannels.length} channels ready.\n`);

  // 3. Notification Templates
  console.log("Notification templates:");
  for (const tpl of notificationTemplates) {
    const channel = await prisma.notificationChannel.findUnique({
      where: { key: tpl.channelKey },
    });
    if (!channel) {
      console.warn(`  [seed] Channel not found: ${tpl.channelKey}`);
      continue;
    }
    await upsertNotificationTemplate(channel.id, tpl);
  }
  console.log(`  ${notificationTemplates.length} templates ready.\n`);

  // 4. Built-in Job Templates
  console.log("Job templates:");
  for (const tpl of builtInJobTemplates) {
    await upsertJobTemplate(tpl);
  }
  console.log(`  ${builtInJobTemplates.length} job templates ready.\n`);

  // 5. Applications
  console.log("Applications:");
  const appRecords: Record<string, string> = {};
  for (const app of applications) {
    const record = await upsertApplication(app);
    appRecords[app.code] = record.id;
  }
  console.log(`  ${applications.length} applications ready.\n`);

  // 5b. Per-application AI Agent config
  console.log("Application configs (ai-agent):");
  for (const code of Object.keys(appRecords)) {
    const appId = appRecords[code];
    for (const field of aiAgentConfigFields) {
      await upsertApplicationConfig(appId, field);
    }
  }
  console.log(
    `  ai-agent config seeded for ${Object.keys(appRecords).length} applications.\n`,
  );

  // 6. System Permissions (platform)
  console.log("System permissions:");
  const systemPermIds = await upsertPermissions(systemPermissions);
  console.log(`  ${systemPermissions.length} system permissions ready.\n`);

  // 7. Organization App Permissions
  console.log("Organization app permissions:");
  const orgPermIds = await upsertPermissions(organizationPermissions);
  console.log(
    `  ${organizationPermissions.length} organization permissions ready.\n`,
  );

  // 8. Admin Menus + Permissions
  console.log("Admin menus:");
  for (const menu of adminMenus) {
    await upsertMenu(appRecords[ADMIN_APP_CODE], menu);
    await linkMenuPermissions(menu.id, menu.permissions, systemPermIds);
  }
  console.log(`  ${adminMenus.length} admin menus ready.\n`);

  // 9. Organization Menus + Permissions
  console.log("Organization menus:");
  for (const menu of organizationMenus) {
    await upsertMenu(appRecords[ORGANIZATION_APP_CODE], menu);
    await linkMenuPermissions(menu.id, menu.permissions, orgPermIds);
  }
  console.log(`  ${organizationMenus.length} organization menus ready.\n`);

  // 10. Platform Roles (system-scoped)
  console.log("Platform roles:");
  const adminRoleRecords: Record<string, string> = {};
  for (const role of adminRoles) {
    const record = await upsertRole(role);
    adminRoleRecords[role.code] = record.id;
  }
  console.log(`  ${adminRoles.length} platform roles ready.\n`);

  // NOTE: Organization roles (owner/member) are per-org-instance and are
  // provisioned when an organization is created (see provisionOrgRoles and
  // step 16 below), not as global templates.

  // 12. Platform Role -> Permission assignments
  console.log("Platform role permissions:");
  for (const [roleCode, permCodes] of Object.entries(adminRolePermissions)) {
    const roleId = adminRoleRecords[roleCode];
    if (!roleId) continue;
    const permIds = permCodes
      .map((code) => systemPermIds[code])
      .filter(Boolean);
    await upsertRolePermissions(roleId, permIds);
    console.log(`  ${roleCode}: ${permIds.length} permissions`);
  }
  console.log();

  // 14. Built-in Users (create user + account)
  console.log("Built-in users:");
  const builtInUserRecords: Record<string, string> = {};
  for (const user of builtInUsers) {
    const record = await upsertUser(user);
    builtInUserRecords[user.id] = record.id;
  }
  console.log(`  ${builtInUsers.length} users ready.\n`);

  // 15. Built-in User Role Assignments
  console.log("Built-in user role assignments:");
  for (const user of builtInUsers) {
    if (user.roleCode) {
      await upsertRoleAssignment({
        userId: builtInUserRecords[user.id],
        roleCode: user.roleCode,
      });
      console.log(`  ${user.email} → ${user.roleCode}`);
    }
  }
  console.log();

  // 16. Built-in Organization (Hapaul owned by hapaul user)
  console.log("Built-in organizations:");
  const hapaulUserId = builtInUserRecords.hapaul;
  if (hapaulUserId) {
    const existingOrg = await prisma.organization.findUnique({
      where: { slug: "hapaul" },
    });
    if (!existingOrg) {
      await prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: {
            name: "Hapaul",
            slug: "hapaul",
            createdAt: new Date(),
          },
        });
        await tx.member.upsert({
          where: {
            organizationId_userId: {
              organizationId: org.id,
              userId: hapaulUserId,
            },
          },
          update: {},
          create: {
            organizationId: org.id,
            userId: hapaulUserId,
            createdAt: new Date(),
          },
        });
        const { ownerRoleId } = await provisionOrgRoles(tx, org.id);
        await tx.roleAssignment.upsert({
          where: {
            userId_roleId: {
              userId: hapaulUserId,
              roleId: ownerRoleId,
            },
          },
          update: {},
          create: {
            userId: hapaulUserId,
            roleId: ownerRoleId,
          },
        });
      });
      console.log(`  Hapaul organization created for hapaul user`);
    } else {
      console.log(`  Hapaul organization already exists, skipping`);
    }
  }
  console.log();

  console.log("=== Seed complete ===");
}
