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
 *   NotificationTemplate, PricingPlan, AiAgent
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
  STUDYBUDDY_APP_CODE,
  USER_ROLE_CODE,
} from "@repo/shared";
import type { ConfigRegistryEntry } from "#lib/config-registry";
import { nextRunFromNow } from "#lib/cron";
import { provisionOrgRoles } from "#lib/org-role";
import { hashPassword } from "#lib/password";
import { APPLICATION_CONFIG_REGISTRY } from "#modules/application/application-config.registry";
import { SYSTEM_CONFIG_REGISTRY } from "#modules/system/system-config.registry";
import { Prisma, type PrismaClient } from "./generated/prisma/client";

// ============================================================
// 1. REFERENCE DATA DEFINITIONS
// ============================================================

// --- System & Application Configs ---
// Config key definitions live in the registries (imported below), which are
// the single source of truth shared with the API services — seed writes
// `defaultValue`, the API validates against `valueSchema`.

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
    code: "system/version:view",
    group: "version",
    name: "View Version & Check Updates",
  },
  {
    code: "system/version:update",
    group: "version",
    name: "Apply Self-Update",
  },
  {
    code: "system/rate-limit:manage",
    group: "rate-limit",
    name: "Manage Rate Limits",
  },
  { code: "system/cache:view", group: "cache", name: "View Cache" },
  { code: "system/cache:manage", group: "cache", name: "Manage Cache" },
  { code: "system/agent:manage", group: "agent", name: "Manage AI Agent" },
  {
    code: "system/ai-provider:list",
    group: "ai-provider",
    name: "List AI Providers",
  },
  {
    code: "system/ai-provider:create",
    group: "ai-provider",
    name: "Create AI Provider",
  },
  {
    code: "system/ai-provider:update",
    group: "ai-provider",
    name: "Update AI Provider",
  },
  {
    code: "system/ai-provider:delete",
    group: "ai-provider",
    name: "Delete AI Provider",
  },
  {
    code: "system/ai-account:list",
    group: "ai-account",
    name: "List AI Accounts",
  },
  {
    code: "system/ai-account:create",
    group: "ai-account",
    name: "Create AI Account",
  },
  {
    code: "system/ai-account:update",
    group: "ai-account",
    name: "Update AI Account",
  },
  {
    code: "system/ai-account:delete",
    group: "ai-account",
    name: "Delete AI Account",
  },
  { code: "system/ai-key:list", group: "ai-key", name: "List AI Keys" },
  { code: "system/ai-key:create", group: "ai-key", name: "Create AI Key" },
  { code: "system/ai-key:update", group: "ai-key", name: "Update AI Key" },
  { code: "system/ai-key:delete", group: "ai-key", name: "Delete AI Key" },
  { code: "system/ai-model:list", group: "ai-model", name: "List AI Models" },
  {
    code: "system/ai-model:create",
    group: "ai-model",
    name: "Create AI Model",
  },
  {
    code: "system/ai-model:update",
    group: "ai-model",
    name: "Update AI Model",
  },
  {
    code: "system/ai-model:delete",
    group: "ai-model",
    name: "Delete AI Model",
  },
  {
    code: "system/ai-model-pricing:list",
    group: "ai-model-pricing",
    name: "List AI Model Pricing",
  },
  {
    code: "system/ai-model-pricing:create",
    group: "ai-model-pricing",
    name: "Create AI Model Pricing",
  },
  {
    code: "system/ai-model-pricing:update",
    group: "ai-model-pricing",
    name: "Update AI Model Pricing",
  },
  {
    code: "system/ai-model-pricing:delete",
    group: "ai-model-pricing",
    name: "Delete AI Model Pricing",
  },
  { code: "system/ai-agent:list", group: "ai-agent", name: "List AI Agents" },
  {
    code: "system/ai-agent:create",
    group: "ai-agent",
    name: "Create AI Agent",
  },
  {
    code: "system/ai-agent:update",
    group: "ai-agent",
    name: "Update AI Agent",
  },
  {
    code: "system/ai-agent:delete",
    group: "ai-agent",
    name: "Delete AI Agent",
  },
  {
    code: "system/ai-usage:list",
    group: "ai-usage",
    name: "List AI Usage Events",
  },
  {
    code: "system/ai-usage:view",
    group: "ai-usage",
    name: "View AI Usage Event",
  },
  {
    code: "system/ai-usage:delete",
    group: "ai-usage",
    name: "Delete AI Usage Events",
  },
  {
    code: "system/pricing-plan:list",
    group: "pricing-plan",
    name: "List Pricing Plans",
  },
  {
    code: "system/pricing-plan:create",
    group: "pricing-plan",
    name: "Create Pricing Plan",
  },
  {
    code: "system/pricing-plan:update",
    group: "pricing-plan",
    name: "Update Pricing Plan",
  },
  {
    code: "system/pricing-plan:delete",
    group: "pricing-plan",
    name: "Delete Pricing Plan",
  },
  {
    code: "system/feature:list",
    group: "feature",
    name: "List Features",
  },
  {
    code: "system/feature:create",
    group: "feature",
    name: "Create Feature",
  },
  {
    code: "system/feature:update",
    group: "feature",
    name: "Update Feature",
  },
  {
    code: "system/feature:delete",
    group: "feature",
    name: "Delete Feature",
  },
  {
    code: "system/quota:list",
    group: "quota",
    name: "List Quotas",
  },
  {
    code: "system/quota:update",
    group: "quota",
    name: "Update Quota",
  },
  {
    code: "system/pricing-subscription:list",
    group: "pricing-subscription",
    name: "List Pricing Subscriptions",
  },
  {
    code: "system/pricing-subscription:create",
    group: "pricing-subscription",
    name: "Create Pricing Subscription",
  },
  {
    code: "system/pricing-subscription:update",
    group: "pricing-subscription",
    name: "Update Pricing Subscription",
  },
  {
    code: "system/pricing-subscription:delete",
    group: "pricing-subscription",
    name: "Delete Pricing Subscription",
  },
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
  { code: "system/job:update", group: "job", name: "Update Job" },
  { code: "system/job:delete", group: "job", name: "Delete Job" },
  { code: "system/job:trigger", group: "job", name: "Trigger Job" },
  { code: "system/job:cancel", group: "job", name: "Cancel Job" },
  { code: "system/dashboard:view", group: "dashboard", name: "View Dashboard" },
  {
    code: "system/redeem-code:list",
    group: "redeem-code",
    name: "List Redeem Codes",
  },
  {
    code: "system/redeem-code:create",
    group: "redeem-code",
    name: "Create Redeem Code",
  },
  {
    code: "system/redeem-code:update",
    group: "redeem-code",
    name: "Update Redeem Code",
  },
  {
    code: "system/redeem-code:delete",
    group: "redeem-code",
    name: "Delete Redeem Code",
  },
  {
    code: "system/user-credit:list",
    group: "user-credit",
    name: "List User Credits",
  },
  {
    code: "system/billing-config:list",
    group: "billing-config",
    name: "List Billing Configs",
  },
  {
    code: "system/billing-config:create",
    group: "billing-config",
    name: "Create Billing Config",
  },
  {
    code: "system/billing-config:update",
    group: "billing-config",
    name: "Update Billing Config",
  },
  {
    code: "system/billing-config:delete",
    group: "billing-config",
    name: "Delete Billing Config",
  },
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

// --- StudyBuddy App Permissions (org-scoped: granted to every org owner) ---
const studybuddyPermissions = [
  {
    code: "org/studybuddy-collection:manage",
    group: "studybuddy-collection",
    name: "Manage Collection",
    description: "Create and manage personal English collection items",
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
  {
    code: STUDYBUDDY_APP_CODE,
    name: "StudyBuddy",
    description: "Study and exam-grading application",
  },
];

// --- Admin App Menus ---
const adminMenus = [
  // Dashboard
  {
    id: "dashboard",
    code: "dashboard",
    name: "Dashboard",
    icon: "LayoutDashboard",
    linkType: "INTERNAL" as const,
    url: "/admin/dashboard",
    sortOrder: 0,
    permissions: ["system/dashboard:view"],
  },
  // Platform Group
  {
    id: "platform",
    code: "platform",
    name: "Platform",
    icon: "ShieldCheck",
    linkType: "GROUP" as const,
    url: null,
    sortOrder: 1,
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
  // Billing Group
  {
    id: "billing",
    code: "billing",
    name: "Billing",
    icon: "CreditCard",
    linkType: "GROUP" as const,
    url: null,
    sortOrder: 2,
    permissions: [],
  },
  {
    id: "pricing",
    code: "pricing",
    name: "Pricing",
    icon: "CreditCard",
    linkType: "INTERNAL" as const,
    url: "/admin/pricing",
    parentId: "billing",
    sortOrder: 1,
    permissions: ["system/pricing-plan:list"],
  },
  {
    id: "subscriptions",
    code: "subscriptions",
    name: "Subscriptions",
    icon: "UserCheck",
    linkType: "INTERNAL" as const,
    url: "/admin/subscriptions",
    parentId: "billing",
    sortOrder: 2,
    permissions: ["system/pricing-subscription:list"],
  },
  {
    id: "quotas",
    code: "quotas",
    name: "Quotas",
    icon: "Gauge",
    linkType: "INTERNAL" as const,
    url: "/admin/quotas",
    parentId: "billing",
    sortOrder: 3,
    permissions: ["system/quota:list"],
  },
  {
    id: "features",
    code: "features",
    name: "Features",
    icon: "Puzzle",
    linkType: "INTERNAL" as const,
    url: "/admin/features",
    parentId: "billing",
    sortOrder: 4,
    permissions: ["system/feature:list"],
  },
  // Credits Group
  {
    id: "credits",
    code: "credits",
    name: "Credits",
    icon: "Coins",
    linkType: "GROUP" as const,
    url: null,
    sortOrder: 3,
    permissions: [],
  },
  {
    id: "redeem-codes",
    code: "redeem-codes",
    name: "Redeem Codes",
    icon: "Ticket",
    linkType: "INTERNAL" as const,
    url: "/admin/redeem-codes",
    parentId: "credits",
    sortOrder: 1,
    permissions: ["system/redeem-code:list"],
  },
  {
    id: "user-credits",
    code: "user-credits",
    name: "User Credits",
    icon: "Wallet",
    linkType: "INTERNAL" as const,
    url: "/admin/user-credits",
    parentId: "credits",
    sortOrder: 2,
    permissions: ["system/user-credit:list"],
  },
  {
    id: "billing-configs",
    code: "billing-configs",
    name: "Billing Configs",
    icon: "ReceiptText",
    linkType: "INTERNAL" as const,
    url: "/admin/billing-configs",
    parentId: "credits",
    sortOrder: 3,
    permissions: ["system/billing-config:list"],
  },
  {
    id: "currency-rates",
    code: "currency-rates",
    name: "Currency Rates",
    icon: "BadgeDollarSign",
    linkType: "INTERNAL" as const,
    url: "/admin/currency-rates",
    parentId: "credits",
    sortOrder: 4,
    permissions: ["system/billing-config:list"],
  },
  // Infrastructure Group
  {
    id: "infrastructure",
    code: "infrastructure",
    name: "Infrastructure",
    icon: "Cog",
    linkType: "GROUP" as const,
    url: null,
    sortOrder: 4,
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
    sortOrder: 1,
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
    sortOrder: 2,
    permissions: ["system/rate-limit:manage"],
  },
  {
    id: "ai-settings",
    code: "ai-settings",
    name: "AI Settings",
    icon: "Bot",
    linkType: "INTERNAL" as const,
    url: "/admin/ai-settings",
    parentId: "infrastructure",
    sortOrder: 3,
    permissions: ["system/ai-provider:list"],
  },
  {
    id: "settings",
    code: "settings",
    name: "System Settings",
    icon: "Settings",
    linkType: "INTERNAL" as const,
    url: "/admin/settings",
    parentId: "infrastructure",
    sortOrder: 5,
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
    sortOrder: 5,
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
    sortOrder: 1,
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
    sortOrder: 2,
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
    sortOrder: 3,
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
    sortOrder: 4,
    permissions: ["system/cache:view"],
  },
  {
    id: "attachments",
    code: "attachments",
    name: "Attachments",
    icon: "Upload",
    linkType: "INTERNAL" as const,
    url: "/admin/attachments",
    parentId: "developer",
    sortOrder: 5,
    permissions: ["system/attachment:list"],
  },
  {
    id: "ai-usage",
    code: "ai-usage",
    name: "AI Usage",
    icon: "FileSpreadsheet",
    linkType: "INTERNAL" as const,
    url: "/admin/ai-usage",
    parentId: "developer",
    sortOrder: 6,
    permissions: ["system/ai-usage:list"],
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

// --- StudyBuddy App Menus ---
const studybuddyMenus = [
  {
    id: "studybuddy-dashboard",
    code: "dashboard",
    name: "Dashboard",
    icon: "LayoutDashboard",
    linkType: "INTERNAL" as const,
    url: "/studybuddy/dashboard",
    sortOrder: 0,
    permissions: ["org/dashboard:view"],
  },
  {
    id: "studybuddy-collection",
    code: "collection",
    name: "Collection",
    icon: "BookMarked",
    linkType: "INTERNAL" as const,
    url: "/studybuddy/collection",
    sortOrder: 1,
    permissions: ["org/studybuddy-collection:manage"],
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
const ADMIN_SEED_CREDITS = 1_000_000;
const ADMIN_SEED_CREDIT_LEDGER_ID = "builtin-admin-seed-credit";

// --- Built-in Job Templates ---
const builtInJobTemplates = [
  {
    name: "session-sweep",
    type: "session-sweep",
    description: "Delete expired and revoked session rows",
    cronExpression: "0 * * * *",
  },
  {
    name: "ai-usage-reserve-sweep",
    type: "ai-usage-reserve-sweep",
    description:
      "Release credit reservations left by AI usage events that never completed",
    cronExpression: "45 * * * *",
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
  {
    name: "sync-currency-rates",
    type: "sync-currency-rates",
    description: "Sync currency rates from the public exchange API",
    cronExpression: "0 4 * * *",
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

/** Maps a registry entry to the row shape expected by `upsertSystemConfig`. */
function registryEntryToSystemRow(e: ConfigRegistryEntry) {
  return {
    group: e.group,
    key: e.key,
    value: e.defaultValue,
    type: e.type,
    label: e.label,
    description: e.description ?? "",
    isSecret: e.isSecret,
    sortOrder: e.sortOrder,
    schema: e.schema,
    mask: e.mask,
  };
}

/** Maps a registry entry to the row shape expected by `upsertApplicationConfig`. */
function registryEntryToAppRow(e: ConfigRegistryEntry) {
  return registryEntryToSystemRow(e);
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
  schema?: Prisma.InputJsonValue;
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
    schema?: Prisma.InputJsonValue;
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

async function upsertUserCredit(userId: string, balance: number) {
  await prisma.$transaction(async (tx) => {
    await tx.userCredit.upsert({
      where: { userId },
      update: { balance },
      create: { userId, balance },
    });
    await tx.userCreditLedger.upsert({
      where: { id: ADMIN_SEED_CREDIT_LEDGER_ID },
      update: {
        userId,
        type: "seed",
        amount: balance,
        balanceBefore: 0,
        balanceAfter: balance,
        referenceType: "seed",
        referenceId: ADMIN_SEED_CREDIT_LEDGER_ID,
        description: "Built-in admin seed credits",
        metadata: { source: "prisma.seed" },
      },
      create: {
        id: ADMIN_SEED_CREDIT_LEDGER_ID,
        userId,
        type: "seed",
        amount: balance,
        balanceBefore: 0,
        balanceAfter: balance,
        referenceType: "seed",
        referenceId: ADMIN_SEED_CREDIT_LEDGER_ID,
        description: "Built-in admin seed credits",
        metadata: { source: "prisma.seed" },
      },
    });
  });
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
// 3b. FEATURES (reference data)
// ============================================================

const features = [
  {
    code: "platform_assistant",
    name: "Platform Assistant",
    description: "Access to the platform AI assistant agent.",
    status: "active",
  },
  {
    code: "studybuddy_enrichment",
    name: "StudyBuddy Enrichment",
    description: "Generate StudyBuddy item enrichments.",
    status: "active",
  },
];

const planFeatures: { planCode: string; featureCode: string }[] = [
  { planCode: "basic", featureCode: "platform_assistant" },
  { planCode: "basic", featureCode: "studybuddy_enrichment" },
];

async function upsertFeature(data: {
  code: string;
  name: string;
  description?: string | null;
  status: string;
}) {
  return prisma.feature.upsert({
    where: { code: data.code },
    update: {
      name: data.name,
      description: data.description ?? null,
      status: data.status,
    },
    create: data,
  });
}

async function upsertPlanFeature(planId: string, featureId: string) {
  await prisma.planFeature.upsert({
    where: {
      planId_featureId: { planId, featureId },
    },
    update: {},
    create: { planId, featureId },
  });
}

// ============================================================
// 3c. PRICING PLANS (reference data)
// ============================================================

const pricingPlans = [
  {
    code: "basic",
    name: "Basic",
    price: 0,
    currency: "USD",
    status: "active",
  },
];

async function upsertPricingPlan(data: {
  code: string;
  name: string;
  price: number;
  currency: string;
  status: string;
}) {
  return prisma.pricingPlan.upsert({
    where: { code: data.code },
    update: {
      name: data.name,
      price: data.price,
      currency: data.currency,
      status: data.status,
    },
    create: data,
  });
}

async function upsertBuiltinPricingSubscription(params: {
  id: string;
  principalType: string;
  principalId: string;
  planId: string;
}) {
  await prisma.pricingSubscription.upsert({
    where: { id: params.id },
    update: {
      principalType: params.principalType,
      principalId: params.principalId,
      planId: params.planId,
      status: "active",
      startsAt: new Date(0),
      endsAt: null,
    },
    create: {
      id: params.id,
      principalType: params.principalType,
      principalId: params.principalId,
      planId: params.planId,
      status: "active",
      startsAt: new Date(0),
      endsAt: null,
    },
  });
}

// ============================================================
// 3d. AI PROVIDERS (reference data)
// ============================================================

const aiProviders = [
  {
    id: "builtin-ai-provider-deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    aiAdapter: "openai_compatible",
    enabled: true,
    description: "DeepSeek OpenAI-compatible API provider.",
  },
  {
    id: "builtin-ai-provider-openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    aiAdapter: "openai",
    enabled: true,
    description: "OpenAI chat completions API provider.",
  },
  {
    id: "builtin-ai-provider-anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    aiAdapter: "anthropic",
    enabled: true,
    description: "Anthropic Messages API provider.",
  },
  {
    id: "builtin-ai-provider-qwen",
    name: "Qwen",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    aiAdapter: "openai_compatible",
    enabled: true,
    description: "Alibaba QWen OpenAI-compatible API provider.",
  },
];

async function upsertAiProvider(data: {
  id: string;
  name: string;
  baseUrl: string;
  aiAdapter: string;
  enabled: boolean;
  description?: string | null;
}) {
  return prisma.aiProvider.upsert({
    where: { id: data.id },
    update: {
      name: data.name,
      baseUrl: data.baseUrl,
      aiAdapter: data.aiAdapter,
      enabled: data.enabled,
      description: data.description ?? null,
    },
    create: data,
  });
}

// ============================================================
// 3d2. AI ACCOUNTS (reference data)
// ============================================================

const aiAccounts = [
  {
    id: "builtin-ai-account-deepseek-official",
    name: "DeepSeek (Official)",
    balance: 0,
    currency: "CNY",
    concurrencyLimit: 2500,
    status: "active",
    providerIds: ["builtin-ai-provider-deepseek"],
  },
];

async function upsertAiAccount(data: {
  id: string;
  name: string;
  balance: number;
  currency: string;
  concurrencyLimit: number;
  status: string;
  providerIds: string[];
}) {
  const account = await prisma.aiAccount.upsert({
    where: { id: data.id },
    update: {
      name: data.name,
      balance: data.balance,
      currency: data.currency,
      concurrencyLimit: data.concurrencyLimit,
      status: data.status,
    },
    create: {
      id: data.id,
      name: data.name,
      balance: data.balance,
      currency: data.currency,
      concurrencyLimit: data.concurrencyLimit,
      status: data.status,
    },
  });

  await prisma.aiAccountProvider.deleteMany({
    where: { accountId: account.id },
  });
  if (data.providerIds.length > 0) {
    await prisma.aiAccountProvider.createMany({
      data: data.providerIds.map((providerId) => ({
        accountId: account.id,
        providerId,
      })),
    });
  }

  return account;
}

const aiModels = [
  {
    providerId: "builtin-ai-provider-deepseek",
    modelId: "deepseek-v4-flash",
    displayName: "deepseek-v4-flash",
    capabilities: [],
    contextWindow: null,
    supportsReasoning: true,
    supportsCaching: true,
    enabled: true,
  },
  {
    providerId: "builtin-ai-provider-deepseek",
    modelId: "deepseek-v4-pro",
    displayName: "deepseek-v4-pro",
    capabilities: [],
    contextWindow: null,
    supportsReasoning: true,
    supportsCaching: true,
    enabled: true,
  },
];

async function upsertAiModel(data: {
  providerId: string;
  modelId: string;
  displayName: string;
  capabilities: string[];
  contextWindow: number | null;
  supportsReasoning: boolean;
  supportsCaching: boolean;
  enabled: boolean;
}) {
  return prisma.aiModel.upsert({
    where: {
      providerId_modelId: {
        providerId: data.providerId,
        modelId: data.modelId,
      },
    },
    update: {
      displayName: data.displayName,
      capabilities: data.capabilities,
      contextWindow: data.contextWindow,
      supportsReasoning: data.supportsReasoning,
      supportsCaching: data.supportsCaching,
      enabled: data.enabled,
    },
    create: data,
  });
}

// ============================================================
// 3d3. AI MODEL PRICING (reference data)
// ============================================================

// DeepSeek peak/off-peak pricing (RMB per 1M tokens), Beijing time (Asia/Shanghai).
// Peak hours: 09:00-12:00 and 14:00-18:00; the rest is off-peak. Peak = 2x off-peak.
// Effective from 2026-08-17 00:00 Beijing time (2026-08-16 16:00 UTC).
const aiModelPricing = [
  {
    id: "builtin-ai-pricing-deepseek-v4-flash",
    modelId: "deepseek-v4-flash",
    accountId: "builtin-ai-account-deepseek-official",
    timeZone: "Asia/Shanghai",
    policy: [
      {
        input: 3.0,
        cachedInput: 0.1,
        output: 9.0,
        startMinutes: 540,
        endMinutes: 720,
      },
      {
        input: 1.5,
        cachedInput: 0.05,
        output: 4.5,
        startMinutes: 720,
        endMinutes: 840,
      },
      {
        input: 3.0,
        cachedInput: 0.1,
        output: 9.0,
        startMinutes: 840,
        endMinutes: 1080,
      },
      {
        input: 1.5,
        cachedInput: 0.05,
        output: 4.5,
        startMinutes: 1080,
        endMinutes: 540,
      },
    ],
    effectiveFrom: new Date("2026-08-16T16:00:00.000Z"),
    effectiveTo: null,
  },
  {
    id: "builtin-ai-pricing-deepseek-v4-pro",
    modelId: "deepseek-v4-pro",
    accountId: "builtin-ai-account-deepseek-official",
    timeZone: "Asia/Shanghai",
    policy: [
      {
        input: 9.0,
        cachedInput: 0.3,
        output: 27.0,
        startMinutes: 540,
        endMinutes: 720,
      },
      {
        input: 4.5,
        cachedInput: 0.15,
        output: 13.5,
        startMinutes: 720,
        endMinutes: 840,
      },
      {
        input: 9.0,
        cachedInput: 0.3,
        output: 27.0,
        startMinutes: 840,
        endMinutes: 1080,
      },
      {
        input: 4.5,
        cachedInput: 0.15,
        output: 13.5,
        startMinutes: 1080,
        endMinutes: 540,
      },
    ],
    effectiveFrom: new Date("2026-08-16T16:00:00.000Z"),
    effectiveTo: null,
  },
  // Launch promo pricing (flat, all-day), RMB per 1M tokens, Beijing time.
  // Effective 2026-08-01 00:00 to 2026-08-17 00:00 Beijing time (handoff at
  // the moment the peak/off-peak rows above become effective).
  {
    id: "builtin-ai-pricing-deepseek-v4-flash-0801",
    modelId: "deepseek-v4-flash",
    accountId: "builtin-ai-account-deepseek-official",
    timeZone: "Asia/Shanghai",
    policy: [
      {
        input: 1.0,
        cachedInput: 0.02,
        output: 2.0,
        startMinutes: 0,
        endMinutes: 1440,
      },
    ],
    effectiveFrom: new Date("2026-07-31T16:00:00.000Z"),
    effectiveTo: new Date("2026-08-16T16:00:00.000Z"),
  },
  {
    id: "builtin-ai-pricing-deepseek-v4-pro-0801",
    modelId: "deepseek-v4-pro",
    accountId: "builtin-ai-account-deepseek-official",
    timeZone: "Asia/Shanghai",
    policy: [
      {
        input: 3.0,
        cachedInput: 0.025,
        output: 6.0,
        startMinutes: 0,
        endMinutes: 1440,
      },
    ],
    effectiveFrom: new Date("2026-07-31T16:00:00.000Z"),
    effectiveTo: new Date("2026-08-16T16:00:00.000Z"),
  },
];

async function upsertAiModelPricing(data: {
  id: string;
  modelId: string;
  accountId: string;
  timeZone: string;
  policy: Array<{
    input: number;
    cachedInput: number;
    output: number;
    startMinutes: number;
    endMinutes: number;
  }>;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}) {
  return prisma.aiModelPricing.upsert({
    where: { id: data.id },
    update: {
      modelId: data.modelId,
      accountId: data.accountId,
      timeZone: data.timeZone,
      policy: data.policy,
      effectiveFrom: data.effectiveFrom,
      effectiveTo: data.effectiveTo,
    },
    create: data,
  });
}

// ============================================================
// 3e. AI AGENTS (reference data)
// ============================================================

const platformAssistantSystemPrompt = [
  "You are the platform AI Agent, an assistant of the user.",
  "",
  'When users ask about your capabilities, such as "What can you do?", respond only with the supplied Available API endpoints, presented in a generic, user-friendly tone. Do not reveal anything else, including tool names, parameters, internal functions, or any non-business details.',
].join("\n");

const aiAgents = [
  {
    code: "platform_assistant",
    name: "Platform Assistant",
    description: "Built-in platform AI assistant.",
    status: "active",
    allowedApis: [] as string[],
    subAgents: {
      chat: {
        label: "Chat and Tools",
        description: "Main user conversation model. Handles tool calling.",
        modelId: "deepseek-v4-flash",
        systemPrompt: platformAssistantSystemPrompt,
        reasoning: "none",
        maxSteps: 8,
      },
      title: {
        label: "Conversation Title",
        description: "Generates a short title from the first user message.",
        modelId: "deepseek-v4-flash",
        systemPrompt:
          "Generate a short title (5-6 words max) summarizing the user's first message below. Return only the title, no quotes or punctuation.",
        reasoning: "none",
        maxOutputTokens: 1000,
      },
    },
  },
  {
    code: "studybuddy_enrichment",
    name: "StudyBuddy Enrichment",
    description: "Generates StudyBuddy learning enrichments.",
    status: "active",
    allowedApis: [] as string[],
    subAgents: {
      default: {
        label: "Default Enrichment",
        description: "Generates StudyBuddy item enrichment content.",
        modelId: "deepseek-v4-flash",
        systemPrompt:
          "You are StudyBuddy's enrichment agent for English learners. Follow the task-specific instructions exactly and keep explanatory prose suitable for Chinese-speaking learners.",
        reasoning: "none",
      },
    },
  },
];

async function upsertAiAgent(data: {
  code: string;
  name: string;
  description: string;
  status: string;
  allowedApis: string[];
  subAgents: Prisma.InputJsonValue;
}) {
  const agent = await prisma.aiAgent.upsert({
    where: { code: data.code },
    update: {
      name: data.name,
      description: data.description,
      status: data.status,
      allowedApis: data.allowedApis,
      subAgents: data.subAgents,
    },
    create: {
      code: data.code,
      name: data.name,
      description: data.description,
      status: data.status,
      allowedApis: data.allowedApis,
      subAgents: data.subAgents,
    },
  });
  return agent;
}

const billingConfigs = [
  {
    resourceType: "ai_agent",
    resourceId: "platform_assistant",
    billingType: "cost_based",
    priceUnit: "credit",
    priceAmount: 0,
    status: "active",
    description: "Bill platform assistant calls by actual model cost.",
  },
  {
    resourceType: "ai_agent",
    resourceId: "studybuddy_enrichment",
    billingType: "per_call",
    priceUnit: "credit",
    priceAmount: 1,
    status: "active",
    description: "Bill StudyBuddy enrichment as a fixed flat call price.",
  },
];

async function upsertBillingConfig(data: {
  resourceType: string;
  resourceId: string;
  billingType: string;
  priceUnit: string;
  priceAmount: number;
  status: string;
  description: string;
}) {
  return prisma.billingConfig.upsert({
    where: {
      resourceType_resourceId: {
        resourceType: data.resourceType,
        resourceId: data.resourceId,
      },
    },
    update: data,
    create: data,
  });
}

const currencyRates = [
  { currency: "USD", rate: 1, status: "active" },
  { currency: "CNY", rate: 6.75, status: "active" },
];

async function upsertCurrencyRate(data: {
  currency: string;
  rate: number;
  status: string;
}) {
  return prisma.currencyRate.upsert({
    where: { currency: data.currency },
    update: { rate: data.rate, status: data.status },
    create: data,
  });
}

// ============================================================
// 4. MAIN SEED (orchestrates desired state)
// ============================================================

export async function seed(client: PrismaClient) {
  prisma = client;

  // 1. System Configs (driven by the registry — single source of truth)
  console.log("System configs:");
  for (const entry of SYSTEM_CONFIG_REGISTRY) {
    await upsertSystemConfig(registryEntryToSystemRow(entry));
  }
  console.log(`  ${SYSTEM_CONFIG_REGISTRY.length} configs ready.\n`);

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

  // 5b. Per-application config (driven by the registry — single source of
  // truth). Covers ai-agent (functional) and ai-agent-ui (visual) groups.
  // `seed: false` entries (e.g. ai-agent.allowedApis) are skipped here.
  console.log("Application configs (ai-agent, ai-agent-ui):");
  const seedableAppConfig = APPLICATION_CONFIG_REGISTRY.filter(
    (e) => e.seed !== false,
  );
  for (const code of Object.keys(appRecords)) {
    const appId = appRecords[code];
    for (const field of seedableAppConfig) {
      await upsertApplicationConfig(appId, registryEntryToAppRow(field));
    }
  }
  console.log(
    `  ${seedableAppConfig.length} config fields seeded for ${Object.keys(appRecords).length} applications.\n`,
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

  // 7b. StudyBuddy App Permissions (org-scoped)
  console.log("StudyBuddy app permissions:");
  const studybuddyPermIds = await upsertPermissions(studybuddyPermissions);
  console.log(
    `  ${studybuddyPermissions.length} studybuddy permissions ready.\n`,
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

  // 9b. StudyBuddy Menus + Permissions
  // Dashboard reuses the shared "org/dashboard:view" permission (lives in
  // orgPermIds); exams/submissions use the studybuddy-specific codes.
  console.log("StudyBuddy menus:");
  const studybuddyMenuPermIds = { ...orgPermIds, ...studybuddyPermIds };
  for (const menu of studybuddyMenus) {
    await upsertMenu(appRecords[STUDYBUDDY_APP_CODE], menu);
    await linkMenuPermissions(menu.id, menu.permissions, studybuddyMenuPermIds);
  }
  console.log(`  ${studybuddyMenus.length} studybuddy menus ready.\n`);

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

  if (builtInUserRecords.admin) {
    await upsertUserCredit(builtInUserRecords.admin, ADMIN_SEED_CREDITS);
    console.log(`  admin@system.local → ${ADMIN_SEED_CREDITS} credits\n`);
  }

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
  // Always re-provisions org roles so newly added org-scoped permissions
  // (e.g. studybuddy) are synced to the Hapaul owner on every seed run.
  console.log("Built-in organizations:");
  const hapaulUserId = builtInUserRecords.hapaul;
  if (hapaulUserId) {
    await prisma.$transaction(async (tx) => {
      let org = await tx.organization.findUnique({
        where: { slug: "hapaul" },
      });
      if (!org) {
        org = await tx.organization.create({
          data: {
            name: "Hapaul",
            slug: "hapaul",
            createdAt: new Date(),
          },
        });
      }
      const orgId = org.id;
      await tx.member.upsert({
        where: {
          organizationId_userId: {
            organizationId: orgId,
            userId: hapaulUserId,
          },
        },
        update: {},
        create: {
          organizationId: orgId,
          userId: hapaulUserId,
          createdAt: new Date(),
        },
      });
      const { ownerRoleId } = await provisionOrgRoles(tx, orgId);
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
    console.log(`  Hapaul organization ready (owner role synced)`);
  }
  console.log();

  // 17. Pricing Plans (reference data; dev: Unlimited grants all categories)
  console.log("Pricing plans:");
  const pricingPlanRecords: Record<string, string> = {};
  for (const plan of pricingPlans) {
    const record = await upsertPricingPlan(plan);
    pricingPlanRecords[plan.code] = record.id;
  }
  console.log(`  ${pricingPlans.length} pricing plans ready.\n`);

  const adminUserId = builtInUserRecords.admin;
  const basicPlanId = pricingPlanRecords.basic;
  if (adminUserId && basicPlanId) {
    await upsertBuiltinPricingSubscription({
      id: "builtin-admin-basic-subscription",
      principalType: "user",
      principalId: adminUserId,
      planId: basicPlanId,
    });
    console.log("  admin@system.local → Basic plan\n");
  }

  // 17b. Features (reference data)
  console.log("Features:");
  const featureRecords: Record<string, string> = {};
  for (const feature of features) {
    const record = await upsertFeature(feature);
    featureRecords[feature.code] = record.id;
  }
  console.log(`  ${features.length} features ready.\n`);

  // 17c. Plan Features
  console.log("Plan features:");
  for (const pf of planFeatures) {
    const planId = pricingPlanRecords[pf.planCode];
    const featureId = featureRecords[pf.featureCode];
    if (planId && featureId) {
      await upsertPlanFeature(planId, featureId);
      console.log(`  ${pf.planCode} → ${pf.featureCode}`);
    }
  }
  console.log();

  // 18. AI Providers (reference data)
  console.log("AI providers:");
  for (const provider of aiProviders) {
    await upsertAiProvider(provider);
  }
  console.log(`  ${aiProviders.length} AI providers ready.\n`);

  // 18b. AI Accounts (reference data)
  console.log("AI accounts:");
  for (const account of aiAccounts) {
    await upsertAiAccount(account);
  }
  console.log(`  ${aiAccounts.length} AI accounts ready.\n`);

  // 19. AI Models (reference data)
  console.log("AI models:");
  const aiModelRecords: Record<string, string> = {};
  for (const model of aiModels) {
    const record = await upsertAiModel(model);
    aiModelRecords[model.modelId] = record.id;
  }
  console.log(`  ${aiModels.length} AI models ready.\n`);

  // 19b. AI Model Pricing (reference data)
  console.log("AI model pricing:");
  for (const pricing of aiModelPricing) {
    const modelRowId = aiModelRecords[pricing.modelId];
    if (!modelRowId) {
      console.warn(
        `  [seed] AI model not found for pricing: ${pricing.modelId}`,
      );
      continue;
    }
    await upsertAiModelPricing({ ...pricing, modelId: modelRowId });
  }
  console.log(`  ${aiModelPricing.length} pricing rows ready.\n`);

  // 20. AI Agents (reference data; built-in platform_assistant)
  console.log("AI agents:");
  for (const agent of aiAgents) {
    await upsertAiAgent(agent);
  }
  console.log(`  ${aiAgents.length} AI agents ready.\n`);

  // 20b. Billing Configs and Currency Rates
  console.log("Billing configs:");
  for (const config of billingConfigs) {
    await upsertBillingConfig(config);
  }
  console.log(`  ${billingConfigs.length} billing configs ready.\n`);

  console.log("Currency rates:");
  for (const rate of currencyRates) {
    await upsertCurrencyRate(rate);
  }
  console.log(`  ${currencyRates.length} currency rates ready.\n`);

  console.log("=== Seed complete ===");
}
