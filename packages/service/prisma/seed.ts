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

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  ADMIN_APP_CODE,
  ADMIN_ROLE_CODE,
  BUILTIN_ROLE_FLAG,
  BUILTIN_USER_FLAG,
  ORG_MEMBER_ROLE_CODE,
  ORG_OWNER_ROLE_CODE,
  ORGANIZATION_APP_CODE,
  USER_ROLE_CODE,
} from "@repo/shared";
import { hashPassword } from "../src/lib/password";
import { Prisma, PrismaClient } from "./generated/prisma/client";

// ============================================================
// 1. REFERENCE DATA DEFINITIONS
// ============================================================

// --- System Configs ---
const systemConfigs = [
  {
    group: "general",
    key: "site.name",
    value: "My Application",
    type: "string",
    label: "settings.fields.siteName",
    description: "settings.fieldsDesc.siteName",
    isSecret: false,
    sortOrder: 0,
  },
  {
    group: "general",
    key: "site.url",
    value: "http://localhost:3000",
    type: "string",
    label: "settings.fields.siteUrl",
    description: "settings.fieldsDesc.siteUrl",
    isSecret: false,
    sortOrder: 1,
  },
  {
    group: "general",
    key: "site.description",
    value: "",
    type: "string",
    label: "settings.fields.siteDescription",
    description: "settings.fieldsDesc.siteDescription",
    isSecret: false,
    sortOrder: 2,
  },
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
    value: "7",
    type: "number",
    label: "settings.fields.sessionMaxAge",
    description: "settings.fieldsDesc.sessionMaxAge",
    isSecret: false,
    sortOrder: 1,
  },
  {
    group: "smtp",
    key: "host",
    value: "",
    type: "string",
    label: "settings.fields.smtpHost",
    description: "settings.fieldsDesc.smtpHost",
    isSecret: false,
    sortOrder: 0,
  },
  {
    group: "smtp",
    key: "port",
    value: "587",
    type: "number",
    label: "settings.fields.smtpPort",
    description: "settings.fieldsDesc.smtpPort",
    isSecret: false,
    sortOrder: 1,
  },
  {
    group: "smtp",
    key: "user",
    value: "",
    type: "string",
    label: "settings.fields.smtpUser",
    description: "settings.fieldsDesc.smtpUser",
    isSecret: false,
    sortOrder: 2,
  },
  {
    group: "smtp",
    key: "password",
    value: "",
    type: "string",
    label: "settings.fields.smtpPassword",
    description: "settings.fieldsDesc.smtpPassword",
    isSecret: true,
    sortOrder: 3,
  },
  {
    group: "smtp",
    key: "from",
    value: "",
    type: "string",
    label: "settings.fields.fromEmail",
    description: "settings.fieldsDesc.fromEmail",
    isSecret: false,
    sortOrder: 4,
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
    sortOrder: 1,
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
];

// --- System Permissions (appId: null) ---
const systemPermissions = [
  {
    code: "system-config::list",
    group: "system-config",
    name: "List System Configs",
  },
  {
    code: "system-config::listByGroup",
    group: "system-config",
    name: "List System Configs by Group",
  },
  {
    code: "system-config::upsert",
    group: "system-config",
    name: "Upsert System Config",
  },
  {
    code: "system-config::batchUpsert",
    group: "system-config",
    name: "Batch Upsert System Configs",
  },
  {
    code: "system-config::delete",
    group: "system-config",
    name: "Delete System Config",
  },
  { code: "system-info::view", group: "system-info", name: "View System Info" },
  { code: "user::list", group: "user", name: "List Users" },
  { code: "user::create", group: "user", name: "Create User" },
  { code: "user::update", group: "user", name: "Update User" },
  { code: "user::delete", group: "user", name: "Delete User" },
  { code: "role::list", group: "role", name: "List Roles" },
  { code: "role::create", group: "role", name: "Create Role" },
  { code: "role::update", group: "role", name: "Update Role" },
  { code: "role::delete", group: "role", name: "Delete Role" },
  { code: "permission::list", group: "permission", name: "List Permissions" },
  { code: "permission::view", group: "permission", name: "View Permission" },
  {
    code: "user-role::list",
    group: "user-role",
    name: "List User-Role Assignments",
  },
  {
    code: "user-role::assign",
    group: "user-role",
    name: "Assign Role to User",
  },
  {
    code: "user-role::remove",
    group: "user-role",
    name: "Remove Role from User",
  },
  { code: "menu::list", group: "menu", name: "List Menus" },
  { code: "menu::view", group: "menu", name: "View Menu" },
  { code: "menu::create", group: "menu", name: "Create Menu" },
  { code: "menu::update", group: "menu", name: "Update Menu" },
  { code: "menu::delete", group: "menu", name: "Delete Menu" },
  { code: "menu::reorder", group: "menu", name: "Reorder Menus" },
  {
    code: "application::list",
    group: "application",
    name: "List Applications",
  },
  { code: "application::view", group: "application", name: "View Application" },
  {
    code: "application::create",
    group: "application",
    name: "Create Application",
  },
  {
    code: "application::update",
    group: "application",
    name: "Update Application",
  },
  {
    code: "application::delete",
    group: "application",
    name: "Delete Application",
  },
  {
    code: "organization::list",
    group: "organization",
    name: "List Organizations",
  },
  {
    code: "organization::view",
    group: "organization",
    name: "View Organization",
  },
  {
    code: "organization::create",
    group: "organization",
    name: "Create Organization",
  },
  {
    code: "organization::update",
    group: "organization",
    name: "Update Organization",
  },
  {
    code: "organization::delete",
    group: "organization",
    name: "Delete Organization",
  },
  { code: "audit-log::list", group: "audit-log", name: "List Audit Logs" },
  { code: "audit-log::view", group: "audit-log", name: "View Audit Log" },
  {
    code: "operation-log::list",
    group: "operation-log",
    name: "List Operation Logs",
  },
  {
    code: "operation-log::view",
    group: "operation-log",
    name: "View Operation Log",
  },
  {
    code: "operation-log::delete",
    group: "operation-log",
    name: "Delete Operation Logs",
  },
  {
    code: "notification-channel::list",
    group: "notification-channel",
    name: "List Notification Channels",
  },
  {
    code: "notification-channel::view",
    group: "notification-channel",
    name: "View Notification Channel",
  },
  {
    code: "notification-channel::create",
    group: "notification-channel",
    name: "Create Notification Channel",
  },
  {
    code: "notification-channel::update",
    group: "notification-channel",
    name: "Update Notification Channel",
  },
  {
    code: "notification-channel::delete",
    group: "notification-channel",
    name: "Delete Notification Channel",
  },
  {
    code: "notification-template::list",
    group: "notification-template",
    name: "List Notification Templates",
  },
  {
    code: "notification-template::view",
    group: "notification-template",
    name: "View Notification Template",
  },
  {
    code: "notification-template::create",
    group: "notification-template",
    name: "Create Notification Template",
  },
  {
    code: "notification-template::update",
    group: "notification-template",
    name: "Update Notification Template",
  },
  {
    code: "notification-template::delete",
    group: "notification-template",
    name: "Delete Notification Template",
  },
  {
    code: "notification::list",
    group: "notification",
    name: "List Notifications",
  },
  {
    code: "notification::view",
    group: "notification",
    name: "View Notification",
  },
  {
    code: "notification-record::list",
    group: "notification-record",
    name: "List Notification Records",
  },
  {
    code: "notification-record::view",
    group: "notification-record",
    name: "View Notification Record",
  },
  { code: "upload::sign", group: "upload", name: "Sign Upload URL" },
  { code: "upload::list", group: "upload", name: "List Uploads" },
  { code: "upload::delete", group: "upload", name: "Delete Uploads" },
  { code: "upload::replace", group: "upload", name: "Replace Upload" },
];

// --- Organization App Permissions ---
const organizationPermissions = [
  {
    code: "dashboard::view",
    group: "dashboard",
    name: "View Dashboard",
    description: "View the organization dashboard",
  },
  {
    code: "organization-member::list",
    group: "organization-member",
    name: "List Organization Members",
    description: "List members of an organization",
  },
  {
    code: "organization-member::remove",
    group: "organization-member",
    name: "Remove Organization Member",
    description: "Remove a member from an organization",
  },
  {
    code: "organization-member::update",
    group: "organization-member",
    name: "Update Organization Member",
    description: "Update an organization member's department assignment",
  },
  {
    code: "organization-settings::view",
    group: "organization-settings",
    name: "View Organization Settings",
    description: "View an organization's settings",
  },
  {
    code: "organization-settings::update",
    group: "organization-settings",
    name: "Update Organization Settings",
    description: "Update an organization's settings",
  },
  {
    code: "department::list",
    group: "department",
    name: "List Departments",
    description: "List departments in an organization",
  },
  {
    code: "department::create",
    group: "department",
    name: "Create Department",
    description: "Create a department in an organization",
  },
  {
    code: "department::update",
    group: "department",
    name: "Update Department",
    description: "Update a department in an organization",
  },
  {
    code: "department::delete",
    group: "department",
    name: "Delete Department",
    description: "Delete a department from an organization",
  },
  {
    code: "position::list",
    group: "position",
    name: "List Positions",
    description: "List positions in an organization",
  },
  {
    code: "position::create",
    group: "position",
    name: "Create Position",
    description: "Create a position in an organization",
  },
  {
    code: "position::update",
    group: "position",
    name: "Update Position",
    description: "Update a position in an organization",
  },
  {
    code: "position::delete",
    group: "position",
    name: "Delete Position",
    description: "Delete a position from an organization",
  },
  {
    code: "position-permission::manage",
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
  {
    id: "applications",
    code: "applications",
    name: "Applications",
    icon: "Layers",
    linkType: "INTERNAL" as const,
    url: "/admin/applications",
    sortOrder: 0,
    permissions: ["application::list"],
  },
  {
    id: "organizations",
    code: "organizations",
    name: "Organizations",
    icon: "Building2",
    linkType: "INTERNAL" as const,
    url: "/admin/organizations",
    sortOrder: 1,
    permissions: ["organization::list"],
  },
  {
    id: "users",
    code: "users",
    name: "Users",
    icon: "User",
    linkType: "INTERNAL" as const,
    url: "/admin/users",
    sortOrder: 2,
    permissions: ["user::list"],
  },
  {
    id: "roles",
    code: "roles",
    name: "Roles",
    icon: "Users",
    linkType: "INTERNAL" as const,
    url: "/admin/roles",
    sortOrder: 3,
    permissions: ["role::list"],
  },
  {
    id: "menus",
    code: "menus",
    name: "Menus",
    icon: "Menu",
    linkType: "INTERNAL" as const,
    url: "/admin/menus",
    sortOrder: 4,
    permissions: ["menu::list"],
  },
  {
    id: "notifications",
    code: "notifications",
    name: "Notifications",
    icon: "Bell",
    linkType: "INTERNAL" as const,
    url: "/admin/notifications",
    sortOrder: 5,
    permissions: ["notification::list"],
  },
  {
    id: "logs",
    code: "logs",
    name: "Logs",
    icon: "FileText",
    linkType: "INTERNAL" as const,
    url: "/admin/logs",
    sortOrder: 6,
    permissions: ["audit-log::list", "operation-log::list"],
  },
  {
    id: "monitor",
    code: "monitor",
    name: "Monitor",
    icon: "Gauge",
    linkType: "INTERNAL" as const,
    url: "/admin/monitor",
    sortOrder: 7,
    permissions: ["system-info::view"],
  },
  {
    id: "uploads",
    code: "uploads",
    name: "Uploads",
    icon: "Upload",
    linkType: "INTERNAL" as const,
    url: "/admin/uploads",
    sortOrder: 8,
    permissions: ["upload::list"],
  },
  {
    id: "settings",
    code: "settings",
    name: "Settings",
    icon: "Settings",
    linkType: "INTERNAL" as const,
    url: "/admin/settings",
    sortOrder: 9,
    permissions: ["system-config::list"],
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
    permissions: ["dashboard::view"],
  },
  {
    id: "organization-members",
    code: "members",
    name: "Members",
    icon: "Users",
    linkType: "INTERNAL" as const,
    url: "/organization/members",
    sortOrder: 1,
    permissions: ["organization-member::list"],
  },
  {
    id: "organization-positions",
    code: "positions",
    name: "Positions",
    icon: "Briefcase",
    linkType: "INTERNAL" as const,
    url: "/organization/positions",
    sortOrder: 2,
    permissions: ["position::list"],
  },
  {
    id: "organization-departments",
    code: "departments",
    name: "Departments",
    icon: "FolderTree",
    linkType: "INTERNAL" as const,
    url: "/organization/departments",
    sortOrder: 3,
    permissions: ["department::list"],
  },
  {
    id: "organization-settings",
    code: "settings",
    name: "Settings",
    icon: "Settings",
    linkType: "INTERNAL" as const,
    url: "/organization/settings",
    sortOrder: 4,
    permissions: ["organization-settings::view"],
  },
];

// --- Roles ---
const adminRoles = [
  { code: ADMIN_ROLE_CODE, name: "Administrator", flags: [BUILTIN_ROLE_FLAG] },
  { code: USER_ROLE_CODE, name: "User", flags: [BUILTIN_ROLE_FLAG] },
];

const organizationRoles = [
  { code: ORG_OWNER_ROLE_CODE, name: "Owner", flags: [BUILTIN_ROLE_FLAG] },
  { code: ORG_MEMBER_ROLE_CODE, name: "Member", flags: [BUILTIN_ROLE_FLAG] },
];

// --- Role -> Permission mappings (by role code) ---
const adminRolePermissions: Record<string, string[]> = {
  [ADMIN_ROLE_CODE]: systemPermissions.map((p) => p.code),
  [USER_ROLE_CODE]: ["upload::sign"],
};

const organizationRolePermissions: Record<string, string[]> = {
  [ORG_OWNER_ROLE_CODE]: organizationPermissions.map((p) => p.code),
  [ORG_MEMBER_ROLE_CODE]: [
    "dashboard::view",
    "organization-member::list",
    "department::list",
  ],
};

// --- Notification Channels ---
const notificationChannels = [
  { key: "in-app", name: "In-App", providerKey: "in-app", enabled: true },
];

// --- Notification Templates (keyed by channel key) ---
const notificationTemplates = [
  {
    channelKey: "in-app",
    key: "welcome",
    name: "Welcome",
    enabled: true,
    bodyTemplate: "Welcome, {{userName}}!",
    variablesSchema: {
      properties: {
        userName: { type: "string", description: "The user's name" },
      },
      required: ["userName"],
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
    appCode: ADMIN_APP_CODE,
  },
  {
    id: "user",
    name: "User",
    email: "user@system.local",
    password: "admin123",
    flags: [BUILTIN_USER_FLAG],
    roleCode: USER_ROLE_CODE,
    appCode: ADMIN_APP_CODE,
  },
];

// ============================================================
// 2. DATABASE CLIENT
// ============================================================

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

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

async function upsertPermission(
  appId: string | null,
  data: { code: string; name: string; group: string; description?: string },
) {
  const existing = await prisma.permission.findFirst({
    where: { appId, code: data.code },
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
      appId,
      code: data.code,
      name: data.name,
      group: data.group,
      description: data.description,
    },
  });
}

async function upsertPermissions(
  appId: string | null,
  definitions: {
    code: string;
    name: string;
    group: string;
    description?: string;
  }[],
) {
  const ids: Record<string, string> = {};
  for (const def of definitions) {
    const perm = await upsertPermission(appId, def);
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
    icon: string;
    linkType: "INTERNAL";
    url: string;
    sortOrder: number;
  },
) {
  return prisma.menu.upsert({
    where: { id: data.id },
    update: {
      name: data.name,
      icon: data.icon,
      linkType: data.linkType,
      url: data.url,
      sortOrder: data.sortOrder,
    },
    create: {
      id: data.id,
      appId,
      code: data.code,
      name: data.name,
      icon: data.icon,
      linkType: data.linkType,
      url: data.url,
      sortOrder: data.sortOrder,
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

async function upsertRole(
  appId: string,
  data: { code: string; name: string; flags: string[] },
) {
  return prisma.role.upsert({
    where: {
      appId_scopeType_scopeId_code: {
        appId,
        scopeType: "PLATFORM",
        scopeId: "",
        code: data.code,
      },
    },
    update: { name: data.name, flags: data.flags },
    create: {
      appId,
      scopeType: "PLATFORM",
      scopeId: "",
      name: data.name,
      code: data.code,
      flags: data.flags,
    },
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
      sortOrder: data.sortOrder,
    },
    create: data,
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
      deletedAt: null,
    },
    create: data,
  });
}

async function upsertNotificationTemplate(
  channelId: string,
  data: {
    key: string;
    name: string;
    enabled: boolean;
    bodyTemplate: string;
    variablesSchema: object;
  },
) {
  return prisma.notificationTemplate.upsert({
    where: { key: data.key },
    update: {
      name: data.name,
      channelId,
      enabled: data.enabled,
      bodyTemplate: data.bodyTemplate,
      variablesSchema: data.variablesSchema,
      deletedAt: null,
    },
    create: {
      key: data.key,
      channelId,
      name: data.name,
      enabled: data.enabled,
      bodyTemplate: data.bodyTemplate,
      variablesSchema: data.variablesSchema,
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
  appCode?: string;
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
      data: { password: hashedPassword },
    });
  } else {
    await prisma.account.create({
      data: {
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password: hashedPassword,
      },
    });
  }

  console.log(`  User: ${params.email}`);
  return user;
}

async function upsertRoleAssignment(params: {
  userId: string;
  roleCode: string;
  appId: string;
}) {
  const role = await prisma.role.findFirst({
    where: {
      appId: params.appId,
      scopeType: "PLATFORM",
      scopeId: "",
      code: params.roleCode,
    },
  });
  if (!role) {
    console.warn(
      `  [seed] Role not found for assignment: appId=${params.appId} code=${params.roleCode}`,
    );
    return;
  }
  await prisma.roleAssignment.upsert({
    where: {
      userId_roleId_scopeType_scopeId: {
        userId: params.userId,
        roleId: role.id,
        scopeType: "PLATFORM",
        scopeId: "",
      },
    },
    update: {},
    create: {
      userId: params.userId,
      roleId: role.id,
      scopeType: "PLATFORM",
      scopeId: "",
    },
  });
}

// ============================================================
// 4. MAIN SEED (orchestrates desired state)
// ============================================================

async function seed() {
  console.log("=== Seeding desired state ===\n");

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

  // 4. Applications
  console.log("Applications:");
  const appRecords: Record<string, string> = {};
  for (const app of applications) {
    const record = await upsertApplication(app);
    appRecords[app.code] = record.id;
  }
  console.log(`  ${applications.length} applications ready.\n`);

  // 5. System Permissions (appId: null)
  console.log("System permissions:");
  const systemPermIds = await upsertPermissions(null, systemPermissions);
  console.log(`  ${systemPermissions.length} system permissions ready.\n`);

  // 6. Organization App Permissions
  console.log("Organization app permissions:");
  const orgPermIds = await upsertPermissions(
    appRecords[ORGANIZATION_APP_CODE],
    organizationPermissions,
  );
  console.log(
    `  ${organizationPermissions.length} organization permissions ready.\n`,
  );

  // 7. Admin Menus + Permissions
  console.log("Admin menus:");
  const allAdminPermIds = { ...systemPermIds };
  for (const menu of adminMenus) {
    await upsertMenu(appRecords[ADMIN_APP_CODE], menu);
    await linkMenuPermissions(menu.id, menu.permissions, allAdminPermIds);
  }
  console.log(`  ${adminMenus.length} admin menus ready.\n`);

  // 8. Organization Menus + Permissions
  console.log("Organization menus:");
  for (const menu of organizationMenus) {
    await upsertMenu(appRecords[ORGANIZATION_APP_CODE], menu);
    await linkMenuPermissions(menu.id, menu.permissions, orgPermIds);
  }
  console.log(`  ${organizationMenus.length} organization menus ready.\n`);

  // 9. Admin Roles
  console.log("Admin roles:");
  const adminRoleRecords: Record<string, string> = {};
  for (const role of adminRoles) {
    const record = await upsertRole(appRecords[ADMIN_APP_CODE], role);
    adminRoleRecords[role.code] = record.id;
  }
  console.log(`  ${adminRoles.length} admin roles ready.\n`);

  // 10. Organization Roles
  console.log("Organization roles:");
  const orgRoleRecords: Record<string, string> = {};
  for (const role of organizationRoles) {
    const record = await upsertRole(appRecords[ORGANIZATION_APP_CODE], role);
    orgRoleRecords[role.code] = record.id;
  }
  console.log(`  ${organizationRoles.length} organization roles ready.\n`);

  // 11. Admin Role -> Permission assignments
  console.log("Admin role permissions:");
  for (const [roleCode, permCodes] of Object.entries(adminRolePermissions)) {
    const roleId = adminRoleRecords[roleCode];
    if (!roleId) continue;
    const permIds = permCodes
      .map((code) => allAdminPermIds[code])
      .filter(Boolean);
    await upsertRolePermissions(roleId, permIds);
    console.log(`  ${roleCode}: ${permIds.length} permissions`);
  }
  console.log();

  // 12. Organization Role -> Permission assignments
  console.log("Organization role permissions:");
  for (const [roleCode, permCodes] of Object.entries(
    organizationRolePermissions,
  )) {
    const roleId = orgRoleRecords[roleCode];
    if (!roleId) continue;
    const permIds = permCodes.map((code) => orgPermIds[code]).filter(Boolean);
    await upsertRolePermissions(roleId, permIds);
    console.log(`  ${roleCode}: ${permIds.length} permissions`);
  }
  console.log();

  // 13. Built-in Users (create user + account)
  console.log("Built-in users:");
  const builtInUserRecords: Record<string, string> = {};
  for (const user of builtInUsers) {
    const record = await upsertUser(user);
    builtInUserRecords[user.id] = record.id;
  }
  console.log(`  ${builtInUsers.length} users ready.\n`);

  // 14. Built-in User Role Assignments
  console.log("Built-in user role assignments:");
  for (const user of builtInUsers) {
    if (user.roleCode && user.appCode) {
      await upsertRoleAssignment({
        userId: builtInUserRecords[user.id],
        roleCode: user.roleCode,
        appId: appRecords[user.appCode],
      });
      console.log(`  ${user.email} → ${user.roleCode}`);
    }
  }
  console.log();

  console.log("=== Seed complete ===");
}

// ============================================================
// 5. RUN
// ============================================================

seed()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
