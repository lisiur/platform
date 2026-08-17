/**
 * ============================================================
 * SEED CONTRACT
 * ============================================================
 * This file defines the DESIRED STATE of all reference/config data.
 * Runs once on first boot against a fresh database (see src/app.ts).
 *
 * Reference data is created through module services wherever one exists
 * (configs, permissions, roles, menus, job templates, pricing, AI,
 * billing) so business rules and validations apply to seeded rows the
 * same as runtime-created ones. Local helpers only cover seed-only rows
 * no service creates: applications, notification channels/templates,
 * built-in users/credits, and the built-in organization.
 *
 * Tables managed by seed:
 *   Application, ApplicationConfig, Permission, Menu, MenuPermission,
 *   Role, RolePermission, SystemConfig, Job, NotificationChannel,
 *   NotificationTemplate, PricingPlan, Feature, PlanFeature,
 *   PricingSubscription, UserQuota, AiProvider, AiAccount,
 *   AiAccountProvider, AiModel, AiModelPricing, AiAgent, BillingConfig,
 *   CurrencyRate, User, Account, RoleAssignment, UserCredit,
 *   UserCreditLedger, Organization, Member
 *
 * To add new reference data:
 *   1. Add definition to the appropriate section below
 *   2. Prefer the owning module's service (create*) over raw prisma
 *   3. Reset the DB (pnpm db:reset) and reboot to re-seed
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
import { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";
import { provisionOrgRoles } from "#lib/org-role";
import { hashPassword } from "#lib/password";
import { createPermission } from "#modules/access-control/permission.service";
import { assignPermissions, assignRole } from "#modules/access-control/public";
import { createRole } from "#modules/access-control/role.service";
import { createAiAccount } from "#modules/ai/ai-account.service";
import { type AiAgentInput, createAiAgent } from "#modules/ai/ai-agent.service";
import { createAiModel } from "#modules/ai/ai-model.service";
import { createAiModelPricing } from "#modules/ai/ai-model-pricing.service";
import { createAiProvider } from "#modules/ai/ai-provider.service";
import { APPLICATION_CONFIG_REGISTRY } from "#modules/application/application-config.registry";
import { createMenu, upsertAppConfig } from "#modules/application/public";
import { createBillingConfig } from "#modules/billing/billing.service";
import { upsertCurrencyRates } from "#modules/billing/currency-rate.service";
import { jobTemplateService } from "#modules/jobs/public";
import {
  createFeature,
  createPricingPlan,
  subscribeUserToBasicPlan,
} from "#modules/pricing/public";
import { upsertConfig } from "#modules/system/public";
import { SYSTEM_CONFIG_REGISTRY } from "#modules/system/system-config.registry";

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

// The #lib/db singleton — the same client the app runtime uses, so seed can
// reuse module services directly. Reference data is created through module
// services (business logic, validation, side effects like quota allocation).
// The remaining local helpers cover seed-only rows no service creates
// (applications, notification channels/templates, built-in users/credits/org).

// ============================================================
// 3. SEED-ONLY HELPERS (no service equivalent)
// ============================================================

async function seedApplication(data: {
  code: string;
  name: string;
  description: string;
}) {
  console.log(`  Application: ${data.code}`);
  return prisma.application.create({
    data: {
      id: data.code,
      code: data.code,
      name: data.name,
      description: data.description,
    },
  });
}

async function seedNotificationChannel(data: {
  key: string;
  name: string;
  providerKey: string;
  enabled: boolean;
}) {
  return prisma.notificationChannel.create({
    data: { ...data, flags: [BUILTIN_NOTIFICATION_FLAG] },
  });
}

async function seedNotificationTemplate(
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
  return prisma.notificationTemplate.create({
    data: {
      key: data.key,
      channelId,
      name: data.name,
      description: data.description ?? null,
      enabled: data.enabled,
      subjectTemplate: data.subjectTemplate ?? null,
      titleTemplate: data.titleTemplate ?? null,
      bodyTemplate: data.bodyTemplate,
      variablesSchema: data.variablesSchema,
      sampleVariables: (data.sampleVariables ?? Prisma.JsonNull) as object,
      flags: [BUILTIN_NOTIFICATION_FLAG],
    },
  });
}

async function seedUser(params: {
  id: string;
  name: string;
  email: string;
  password: string;
  flags: string[];
  roleCode?: string;
}) {
  const user = await prisma.user.create({
    data: {
      id: params.id,
      name: params.name,
      email: params.email,
      emailVerified: true,
      flags: params.flags,
    },
  });

  await prisma.account.create({
    data: {
      accountId: params.email.toLowerCase(),
      providerId: "credential",
      userId: user.id,
      providerData: { password: await hashPassword(params.password) },
    },
  });

  console.log(`  User: ${params.email}`);
  return user;
}

async function seedAdminCredits(userId: string, balance: number) {
  await prisma.$transaction([
    prisma.userCredit.create({ data: { userId, balance } }),
    prisma.userCreditLedger.create({
      data: {
        id: ADMIN_SEED_CREDIT_LEDGER_ID,
        userId,
        type: "seed",
        amount: balance,
        balanceBefore: 0,
        balanceAfter: balance,
        referenceType: "seed",
        referenceId: ADMIN_SEED_CREDIT_LEDGER_ID,
        description: "Built-in admin seed credits",
        metadata: { source: "seed" },
      },
    }),
  ]);
}

// ============================================================
// 3b/3c. PRICING (features, plans, plan-feature links) — created
// via pricing module services (createFeature / createPricingPlan)
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

const pricingPlans = [
  {
    code: "basic",
    name: "Basic",
    price: 0,
    currency: "CNY",
    status: "active",
  },
];

// ============================================================
// 3d. AI PROVIDERS (reference data; `key` is a seed-local
// reference used by accounts/models below — DB ids are generated
// by the service and threaded through id maps)
// ============================================================

const aiProviders = [
  {
    key: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    aiAdapter: "openai_compatible",
    enabled: true,
    description: "DeepSeek OpenAI-compatible API provider.",
  },
  {
    key: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    aiAdapter: "openai",
    enabled: true,
    description: "OpenAI chat completions API provider.",
  },
  {
    key: "anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    aiAdapter: "anthropic",
    enabled: true,
    description: "Anthropic Messages API provider.",
  },
  {
    key: "qwen",
    name: "Qwen",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    aiAdapter: "openai_compatible",
    enabled: true,
    description: "Alibaba QWen OpenAI-compatible API provider.",
  },
];

// ============================================================
// 3d2. AI ACCOUNTS (reference data)
// ============================================================

const aiAccounts = [
  {
    key: "deepseek-official",
    name: "DeepSeek (Official)",
    balance: 0,
    currency: "CNY",
    concurrencyLimit: 2500,
    status: "active",
    providerKeys: ["deepseek"],
  },
];

const aiModels = [
  {
    providerKey: "deepseek",
    modelId: "deepseek-v4-flash",
    displayName: "deepseek-v4-flash",
    capabilities: [],
    contextWindow: null,
    supportsReasoning: true,
    supportsCaching: true,
    enabled: true,
  },
  {
    providerKey: "deepseek",
    modelId: "deepseek-v4-pro",
    displayName: "deepseek-v4-pro",
    capabilities: [],
    contextWindow: null,
    supportsReasoning: true,
    supportsCaching: true,
    enabled: true,
  },
];

// ============================================================
// 3d3. AI MODEL PRICING (reference data)
// ============================================================

// DeepSeek peak/off-peak pricing (RMB per 1M tokens), Beijing time (Asia/Shanghai).
// Peak hours: 09:00-12:00 and 14:00-18:00; the rest is off-peak. Peak = 2x off-peak.
// Effective from 2026-08-17 00:00 Beijing time (2026-08-16 16:00 UTC).
const aiModelPricing = [
  {
    modelId: "deepseek-v4-flash",
    accountKey: "deepseek-official",
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
    modelId: "deepseek-v4-pro",
    accountKey: "deepseek-official",
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
    modelId: "deepseek-v4-flash",
    accountKey: "deepseek-official",
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
    modelId: "deepseek-v4-pro",
    accountKey: "deepseek-official",
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

// ============================================================
// 3e. AI AGENTS (reference data)
// ============================================================

const platformAssistantSystemPrompt = [
  "You are the platform AI Agent, an assistant of the user.",
  "",
  'When users ask about your capabilities, such as "What can you do?", respond only with the supplied Available API endpoints, presented in a generic, user-friendly tone. Do not reveal anything else, including tool names, parameters, internal functions, or any non-business details.',
].join("\n");

const aiAgents: AiAgentInput[] = [
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
        reasoning: "none" as const,
        maxSteps: 8,
      },
      title: {
        label: "Conversation Title",
        description: "Generates a short title from the first user message.",
        modelId: "deepseek-v4-flash",
        systemPrompt:
          "Generate a short title (5-6 words max) summarizing the user's first message below. Return only the title, no quotes or punctuation.",
        reasoning: "none" as const,
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
        reasoning: "none" as const,
      },
    },
  },
];

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

const currencyRates = [
  { currency: "USD", rate: 1 },
  { currency: "CNY", rate: 6.75 },
];

// ============================================================
// 4. MAIN SEED (orchestrates desired state)
// ============================================================

/** Creates permission definitions via the service, returning code → id map. */
async function createPermissions(
  definitions: {
    code: string;
    name: string;
    group: string;
    description?: string;
  }[],
) {
  const ids: Record<string, string> = {};
  for (const def of definitions) {
    const perm = await createPermission(def);
    ids[def.code] = perm.id;
  }
  return ids;
}

export async function seed() {
  // 1. System Configs (registry-driven; upsertConfig validates values against
  // the registry schema and writes registry-authoritative metadata)
  console.log("System configs:");
  for (const entry of SYSTEM_CONFIG_REGISTRY) {
    await upsertConfig(entry.group, entry.key, { value: entry.defaultValue });
  }
  console.log(`  ${SYSTEM_CONFIG_REGISTRY.length} configs ready.\n`);

  // 2. Notification Channels
  console.log("Notification channels:");
  const channelIds: Record<string, string> = {};
  for (const ch of notificationChannels) {
    const record = await seedNotificationChannel(ch);
    channelIds[ch.key] = record.id;
  }
  console.log(`  ${notificationChannels.length} channels ready.\n`);

  // 3. Notification Templates
  console.log("Notification templates:");
  for (const tpl of notificationTemplates) {
    const channelId = channelIds[tpl.channelKey];
    if (!channelId) {
      console.warn(`  [seed] Channel not found: ${tpl.channelKey}`);
      continue;
    }
    await seedNotificationTemplate(channelId, tpl);
  }
  console.log(`  ${notificationTemplates.length} templates ready.\n`);

  // 4. Built-in Job Templates (service validates cron + arms the scheduler)
  console.log("Job templates:");
  for (const tpl of builtInJobTemplates) {
    await jobTemplateService.createTemplate({ ...tpl, enabled: true });
  }
  console.log(`  ${builtInJobTemplates.length} job templates ready.\n`);

  // 5. Applications
  console.log("Applications:");
  const appRecords: Record<string, string> = {};
  for (const app of applications) {
    const record = await seedApplication(app);
    appRecords[app.code] = record.id;
  }
  console.log(`  ${applications.length} applications ready.\n`);

  // 5b. Per-application config (registry-driven; upsertAppConfig validates
  // values and writes registry-authoritative metadata).
  // `seed: false` entries (e.g. ai-agent.allowedApis) are skipped here.
  console.log("Application configs (ai-agent, ai-agent-ui):");
  const seedableAppConfig = APPLICATION_CONFIG_REGISTRY.filter(
    (e) => e.seed !== false,
  );
  for (const appId of Object.values(appRecords)) {
    for (const field of seedableAppConfig) {
      await upsertAppConfig(appId, field.group, field.key, {
        value: field.defaultValue,
      });
    }
  }
  console.log(
    `  ${seedableAppConfig.length} config fields seeded for ${Object.keys(appRecords).length} applications.\n`,
  );

  // 6. System Permissions (platform)
  console.log("System permissions:");
  const systemPermIds = await createPermissions(systemPermissions);
  console.log(`  ${systemPermissions.length} system permissions ready.\n`);

  // 7. Organization App Permissions
  console.log("Organization app permissions:");
  const orgPermIds = await createPermissions(organizationPermissions);
  console.log(
    `  ${organizationPermissions.length} organization permissions ready.\n`,
  );

  // 7b. StudyBuddy App Permissions (org-scoped)
  console.log("StudyBuddy app permissions:");
  const studybuddyPermIds = await createPermissions(studybuddyPermissions);
  console.log(
    `  ${studybuddyPermissions.length} studybuddy permissions ready.\n`,
  );

  // 8-9b. Menus (createMenu validates parent groups, permission scope per
  // app, and computes sortOrder; menu defs reference parents by their seed
  // id, resolved through a per-app id map)
  async function seedMenus(
    label: string,
    appId: string,
    menus: {
      id: string;
      code: string;
      name: string;
      icon?: string | null;
      linkType: "GROUP" | "INTERNAL" | "EXTERNAL";
      url?: string | null;
      sortOrder: number;
      parentId?: string | null;
      permissions: string[];
    }[],
    permissionLookup: Record<string, string>,
  ) {
    console.log(label);
    const menuIds: Record<string, string> = {};
    for (const menu of menus) {
      const created = await createMenu({
        appId,
        name: menu.name,
        code: menu.code,
        parentId: menu.parentId ? menuIds[menu.parentId] : null,
        icon: menu.icon ?? null,
        linkType: menu.linkType,
        url: menu.url ?? null,
        permissionIds: menu.permissions
          .map((code) => permissionLookup[code])
          .filter(Boolean),
      });
      menuIds[menu.id] = created.id;
    }
    console.log(`  ${menus.length} menus ready.\n`);
  }

  await seedMenus("Admin menus:", appRecords[ADMIN_APP_CODE], adminMenus, {
    ...systemPermIds,
  });
  await seedMenus(
    "Organization menus:",
    appRecords[ORGANIZATION_APP_CODE],
    organizationMenus,
    orgPermIds,
  );
  // Dashboard reuses the shared "org/dashboard:view" permission (lives in
  // orgPermIds); exams/submissions use the studybuddy-specific codes.
  await seedMenus(
    "StudyBuddy menus:",
    appRecords[STUDYBUDDY_APP_CODE],
    studybuddyMenus,
    { ...orgPermIds, ...studybuddyPermIds },
  );

  // 10. Platform Roles (system-scoped)
  console.log("Platform roles:");
  const adminRoleRecords: Record<string, string> = {};
  for (const role of adminRoles) {
    const record = await createRole(role);
    adminRoleRecords[role.code] = record.id;
  }
  console.log(`  ${adminRoles.length} platform roles ready.\n`);

  // NOTE: Organization roles (owner/member) are per-org-instance and are
  // provisioned when an organization is created (see provisionOrgRoles and
  // step 16 below), not as global templates.

  // 12. Platform Role -> Permission assignments (assignPermissions validates
  // scope and replaces the role's full permission set)
  console.log("Platform role permissions:");
  for (const [roleCode, permCodes] of Object.entries(adminRolePermissions)) {
    const roleId = adminRoleRecords[roleCode];
    if (!roleId) continue;
    const permIds = permCodes
      .map((code) => systemPermIds[code])
      .filter(Boolean);
    await assignPermissions(roleId, permIds);
    console.log(`  ${roleCode}: ${permIds.length} permissions`);
  }
  console.log();

  // 14. Built-in Users (create user + credential account)
  console.log("Built-in users:");
  const builtInUserRecords: Record<string, string> = {};
  for (const user of builtInUsers) {
    const record = await seedUser(user);
    builtInUserRecords[user.id] = record.id;
  }
  console.log(`  ${builtInUsers.length} users ready.\n`);

  if (builtInUserRecords.admin) {
    await seedAdminCredits(builtInUserRecords.admin, ADMIN_SEED_CREDITS);
    console.log(`  admin@system.local → ${ADMIN_SEED_CREDITS} credits\n`);
  }

  // 15. Built-in User Role Assignments
  console.log("Built-in user role assignments:");
  for (const user of builtInUsers) {
    if (user.roleCode) {
      const roleId = adminRoleRecords[user.roleCode];
      if (!roleId) {
        console.warn(
          `  [seed] Role not found for assignment: code=${user.roleCode}`,
        );
        continue;
      }
      await assignRole({ userId: builtInUserRecords[user.id], roleId });
      console.log(`  ${user.email} → ${user.roleCode}`);
    }
  }
  console.log();

  // 16. Built-in Organization (Hapaul owned by hapaul user; owner role gets
  // all org-scoped permissions via provisionOrgRoles)
  console.log("Built-in organizations:");
  const hapaulUserId = builtInUserRecords.hapaul;
  if (hapaulUserId) {
    await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: "Hapaul",
          slug: "hapaul",
          createdAt: new Date(),
        },
      });
      await tx.member.create({
        data: {
          organizationId: org.id,
          userId: hapaulUserId,
          createdAt: new Date(),
        },
      });
      const { ownerRoleId } = await provisionOrgRoles(tx, org.id);
      await tx.roleAssignment.create({
        data: {
          userId: hapaulUserId,
          roleId: ownerRoleId,
        },
      });
    });
    console.log(`  Hapaul organization ready (owner role synced)`);
  }
  console.log();

  // 17. Pricing: features, then plans with their feature links
  console.log("Features:");
  const featureRecords: Record<string, string> = {};
  for (const feature of features) {
    const record = await createFeature(feature);
    featureRecords[feature.code] = record.id;
  }
  console.log(`  ${features.length} features ready.\n`);

  console.log("Pricing plans:");
  for (const plan of pricingPlans) {
    await createPricingPlan({
      ...plan,
      features: planFeatures
        .filter((pf) => pf.planCode === plan.code)
        .map((pf) => ({ featureId: featureRecords[pf.featureCode] }))
        .filter((f) => !!f.featureId),
    });
    console.log(
      `  ${plan.code} → ${planFeatures.filter((pf) => pf.planCode === plan.code).length} features`,
    );
  }
  console.log();

  // Built-in users are subscribed to the basic plan via the same service the
  // registration flow uses (also allocates their quota row).
  console.log("Pricing subscriptions:");
  for (const user of builtInUsers) {
    const userId = builtInUserRecords[user.id];
    if (!userId) continue;
    await subscribeUserToBasicPlan(userId);
    console.log(`  ${user.email} → basic plan`);
  }
  console.log();

  // 18. AI Providers (service-generated ids are captured for accounts/models)
  console.log("AI providers:");
  const aiProviderIds: Record<string, string> = {};
  for (const provider of aiProviders) {
    const { key, ...data } = provider;
    const record = await createAiProvider(data);
    aiProviderIds[key] = record.id;
  }
  console.log(`  ${aiProviders.length} AI providers ready.\n`);

  // 18b. AI Accounts
  console.log("AI accounts:");
  const aiAccountIds: Record<string, string> = {};
  for (const account of aiAccounts) {
    const { key, providerKeys, ...data } = account;
    const record = await createAiAccount({
      ...data,
      providerIds: providerKeys.map((k) => aiProviderIds[k]).filter(Boolean),
    });
    aiAccountIds[key] = record.id;
  }
  console.log(`  ${aiAccounts.length} AI accounts ready.\n`);

  // 19. AI Models (keyed by logical modelId for pricing lookups)
  console.log("AI models:");
  const aiModelRecords: Record<string, string> = {};
  for (const model of aiModels) {
    const { providerKey, ...data } = model;
    const record = await createAiModel({
      ...data,
      providerId: aiProviderIds[providerKey],
    });
    aiModelRecords[model.modelId] = record.id;
  }
  console.log(`  ${aiModels.length} AI models ready.\n`);

  // 19b. AI Model Pricing (service validates policy shape + date overlap)
  console.log("AI model pricing:");
  for (const pricing of aiModelPricing) {
    const modelRowId = aiModelRecords[pricing.modelId];
    const accountRowId = aiAccountIds[pricing.accountKey];
    if (!modelRowId || !accountRowId) {
      console.warn(
        `  [seed] Missing model/account for pricing: ${pricing.modelId}`,
      );
      continue;
    }
    const { accountKey, ...data } = pricing;
    await createAiModelPricing({
      ...data,
      modelId: modelRowId,
      accountId: accountRowId,
    });
  }
  console.log(`  ${aiModelPricing.length} pricing rows ready.\n`);

  // 20. AI Agents (service validates subAgents schema)
  console.log("AI agents:");
  for (const agent of aiAgents) {
    await createAiAgent(agent);
  }
  console.log(`  ${aiAgents.length} AI agents ready.\n`);

  // 20b. Billing Configs and Currency Rates
  console.log("Billing configs:");
  for (const config of billingConfigs) {
    await createBillingConfig(config);
  }
  console.log(`  ${billingConfigs.length} billing configs ready.\n`);

  console.log("Currency rates:");
  await upsertCurrencyRates(currencyRates);
  console.log(`  ${currencyRates.length} currency rates ready.\n`);

  console.log("=== Seed complete ===");
}
