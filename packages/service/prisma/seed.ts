import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { BUILTIN_ROLE_FLAG, BUILTIN_USER_FLAG } from "@repo/shared";
import { hashPassword } from "../src/lib/password";
import { PrismaClient } from "./generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const menuPermissionCode = (code: string) => `menu-item:${code}::view`;

const permissionDefinitions = [
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
  { code: "upload::sign", group: "upload", name: "Sign Upload URL" },
];

const uploadHotlinkSchema = {
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
};

const defaultConfigs = [
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
    schema: uploadHotlinkSchema,
    label: "settings.fields.uploadHotlink",
    description: "settings.fieldsDesc.uploadHotlink",
    isSecret: false,
    sortOrder: 0,
  },
];

async function seedAdminApplication() {
  console.log("Seeding admin application...");
  const app = await prisma.application.upsert({
    where: { code: "admin" },
    update: {
      name: "Admin Panel",
      description: "Administrative dashboard application",
    },
    create: {
      id: "admin",
      name: "Admin Panel",
      code: "admin",
      description: "Administrative dashboard application",
    },
  });
  console.log(`Admin application ready: ${app.id}`);
  return app;
}

async function seedPermissions(appId: string) {
  console.log("Seeding permissions...");
  const permissionIds: Record<string, string> = {};

  for (const def of permissionDefinitions) {
    const perm = await prisma.permission.upsert({
      where: { appId_code: { appId, code: def.code } },
      update: { name: def.name, group: def.group },
      create: {
        appId,
        name: def.name,
        code: def.code,
        group: def.group,
      },
    });
    permissionIds[def.code] = perm.id;
  }

  console.log(`Seeded ${permissionDefinitions.length} permissions.`);
  return permissionIds;
}

async function seedMenus(appId: string) {
  console.log("Seeding admin menus...");

  const menuDefinitions = [
    {
      id: "applications",
      name: "Applications",
      code: "applications",
      icon: "Layers",
      linkType: "INTERNAL" as const,
      url: "/applications",
      sortOrder: 0,
    },
    {
      id: "organizations",
      name: "Organizations",
      code: "organizations",
      icon: "Building2",
      linkType: "INTERNAL" as const,
      url: "/organizations",
      sortOrder: 1,
    },
    {
      id: "users",
      name: "Users",
      code: "users",
      icon: "Users",
      linkType: "INTERNAL" as const,
      url: "/users",
      sortOrder: 2,
    },
    {
      id: "notifications",
      name: "Notifications",
      code: "notifications",
      icon: "Bell",
      linkType: "INTERNAL" as const,
      url: "/notifications",
      sortOrder: 3,
    },
    {
      id: "logs",
      name: "Logs",
      code: "logs",
      icon: "FileText",
      linkType: "INTERNAL" as const,
      url: "/logs",
      sortOrder: 4,
    },
    {
      id: "monitor",
      name: "Monitor",
      code: "monitor",
      icon: "LayoutDashboard",
      linkType: "INTERNAL" as const,
      url: "/monitor",
      sortOrder: 5,
    },
    {
      id: "settings",
      name: "Settings",
      code: "settings",
      icon: "Settings",
      linkType: "INTERNAL" as const,
      url: "/settings",
      sortOrder: 6,
    },
  ];

  const menuIds: string[] = [];

  for (const menu of menuDefinitions) {
    const permCode = menuPermissionCode(menu.code);

    const permission = await prisma.permission.upsert({
      where: { appId_code: { appId, code: permCode } },
      update: { name: `Menu: ${menu.name}` },
      create: {
        appId,
        name: `Menu: ${menu.name}`,
        code: permCode,
        group: "menu-item",
        description: `View access for menu "${menu.name}"`,
      },
    });

    await prisma.menu.upsert({
      where: { id: menu.id },
      update: {
        name: menu.name,
        icon: menu.icon,
        linkType: menu.linkType,
        url: menu.url,
        sortOrder: menu.sortOrder,
        permissionId: permission.id,
      },
      create: {
        id: menu.id,
        appId,
        name: menu.name,
        code: menu.code,
        icon: menu.icon,
        linkType: menu.linkType,
        url: menu.url,
        sortOrder: menu.sortOrder,
        permissionId: permission.id,
      },
    });
    menuIds.push(menu.id);
  }

  console.log(`Seeded ${menuIds.length} menus.`);
  return menuIds;
}

async function seedRoles(appId: string) {
  console.log("Seeding roles...");

  const roleDefinitions = [
    {
      name: "Administrator",
      code: "admin",
      flags: [BUILTIN_ROLE_FLAG],
    },
    {
      name: "User",
      code: "user",
      flags: [BUILTIN_ROLE_FLAG],
    },
  ];

  const roleIds: Record<string, string> = {};

  for (const def of roleDefinitions) {
    const role = await prisma.role.upsert({
      where: { appId_code: { appId, code: def.code } },
      update: {
        name: def.name,
        flags: def.flags,
      },
      create: {
        appId,
        name: def.name,
        code: def.code,
        flags: def.flags,
      },
    });
    roleIds[def.code] = role.id;
  }

  console.log(`Seeded ${Object.keys(roleIds).length} roles.`);
  return roleIds;
}

async function seedNotificationChannels() {
  console.log("Seeding notification channels...");

  await prisma.notificationChannel.upsert({
    where: { key: "in-app" },
    update: {
      name: "In-App",
      providerKey: "in-app",
      enabled: true,
      config: null,
      deletedAt: null,
    },
    create: {
      key: "in-app",
      name: "In-App",
      providerKey: "in-app",
      enabled: true,
    },
  });

  console.log("Notification channels ready.");
}

async function seedNotificationTemplates() {
  console.log("Seeding notification templates...");

  const inAppChannel = await prisma.notificationChannel.findUnique({
    where: { key: "in-app" },
  });

  if (!inAppChannel) {
    console.log("Skipping notification templates: in-app channel not found");
    return;
  }

  await prisma.notificationTemplate.upsert({
    where: { key: "welcome" },
    update: {
      name: "Welcome",
      channelId: inAppChannel.id,
      enabled: true,
      bodyTemplate: "Welcome, {{userName}}!",
      variablesSchema: {
        properties: {
          userName: { type: "string", description: "The user's name" },
        },
        required: ["userName"],
      },
      deletedAt: null,
    },
    create: {
      key: "welcome",
      channelId: inAppChannel.id,
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
  });

  console.log("Notification templates ready.");
}

async function seedRolePermissions(
  roleId: string,
  permissionIds: Record<string, string>,
) {
  console.log(`Assigning permissions to role...`);

  const allPermissionIds = Object.values(permissionIds);

  for (const permissionId of allPermissionIds) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId } },
      update: {},
      create: { roleId, permissionId },
    });
  }

  console.log(`Assigned ${allPermissionIds.length} permissions to role.`);
}

async function seedUser(params: {
  id: string;
  name: string;
  email: string;
  password: string;
  flags?: string[];
}) {
  const user = await prisma.user.upsert({
    where: { email: params.email },
    update: { flags: params.flags ?? [] },
    create: {
      id: params.id,
      name: params.name,
      email: params.email,
      emailVerified: true,
      flags: params.flags ?? [],
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

  console.log(`User ready: ${params.email}`);
  return user;
}

async function seedUserRole(userId: string, roleId: string) {
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId } },
    update: {},
    create: { userId, roleId },
  });
}

async function seed() {
  console.log("Seeding system configs...");

  for (const config of defaultConfigs) {
    await prisma.systemConfig.upsert({
      where: {
        group_key: {
          group: config.group,
          key: config.key,
        },
      },
      update: {
        value: config.value,
        type: config.type,
        schema: "schema" in config ? config.schema : undefined,
        label: config.label,
        description: config.description,
        isSecret: config.isSecret,
        sortOrder: config.sortOrder,
      },
      create: config,
    });
  }

  console.log(`Seeded ${defaultConfigs.length} default configurations.`);
  await seedNotificationChannels();
  await seedNotificationTemplates();

  const adminApp = await seedAdminApplication();
  await seedPermissions(adminApp.id);
  const _menuIds = await seedMenus(adminApp.id);
  const roleIds = await seedRoles(adminApp.id);

  const allPermissions = await prisma.permission.findMany({
    where: { appId: adminApp.id },
    select: { id: true, code: true },
  });
  const permIds: Record<string, string> = {};
  for (const p of allPermissions) {
    permIds[p.code] = p.id;
  }

  await seedRolePermissions(roleIds.admin, permIds);

  // Assign basic permissions to user role
  const userPermCodes = [
    "application::view",
    "menu::list",
    "menu::view",
    "upload::sign",
  ];
  const userPermIds: Record<string, string> = {};
  for (const code of userPermCodes) {
    if (permIds[code]) {
      userPermIds[code] = permIds[code];
    }
  }
  await seedRolePermissions(roleIds.user, userPermIds);

  const adminUser = await seedUser({
    id: "admin",
    name: "Admin",
    email: "admin@system.local",
    password: "admin123",
    flags: [BUILTIN_USER_FLAG],
  });
  await seedUserRole(adminUser.id, roleIds.admin);

  const regularUser = await seedUser({
    id: "user",
    name: "User",
    email: "user@system.local",
    password: "admin123",
    flags: [BUILTIN_USER_FLAG],
  });
  await seedUserRole(regularUser.id, roleIds.user);
}

seed()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
