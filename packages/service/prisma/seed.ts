import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { BUILTIN_ROLE_FLAG, BUILTIN_USER_FLAG } from "@repo/shared";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient } from "./generated/prisma/client";

const adapter = new PrismaPg({
  // biome-ignore lint/style/noNonNullAssertion: seed script, DATABASE_URL is required
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

const defaultConfigs = [
  // General settings
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

  // Auth settings
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

  // SMTP settings
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

async function seedMenus(appId: string) {
  console.log("Seeding admin menus...");

  const menuDefinitions = [
    {
      id: "dashboard",
      name: "Dashboard",
      code: "dashboard",
      icon: "LayoutDashboard",
      linkType: "INTERNAL" as const,
      sortOrder: 0,
    },
    {
      id: "applications",
      name: "Applications",
      code: "applications",
      icon: "Layers",
      linkType: "INTERNAL" as const,
      sortOrder: 1,
    },
    {
      id: "organizations",
      name: "Organizations",
      code: "organizations",
      icon: "Building2",
      linkType: "INTERNAL" as const,
      sortOrder: 2,
    },
    {
      id: "users",
      name: "Users",
      code: "users",
      icon: "Users",
      linkType: "INTERNAL" as const,
      sortOrder: 3,
    },
    {
      id: "logs",
      name: "Logs",
      code: "logs",
      icon: "FileText",
      linkType: "INTERNAL" as const,
      sortOrder: 4,
    },
    {
      id: "settings",
      name: "Settings",
      code: "settings",
      icon: "Settings",
      linkType: "INTERNAL" as const,
      sortOrder: 5,
    },
  ];

  const menuIds: string[] = [];

  for (const menu of menuDefinitions) {
    await prisma.menu.upsert({
      where: { id: menu.id },
      update: {
        name: menu.name,
        icon: menu.icon,
        linkType: menu.linkType,
        sortOrder: menu.sortOrder,
      },
      create: {
        id: menu.id,
        appId,
        name: menu.name,
        code: menu.code,
        icon: menu.icon,
        linkType: menu.linkType,
        sortOrder: menu.sortOrder,
      },
    });
    menuIds.push(menu.id);
  }

  console.log(`Seeded ${menuIds.length} menus.`);
  return menuIds;
}

async function seedMenuRoles(menuIds: string[], roleId: string) {
  console.log(`Assigning menus to role "${roleId}"...`);

  for (const menuId of menuIds) {
    await prisma.menuRole.upsert({
      where: { menuId_roleId: { menuId, roleId } },
      update: {},
      create: { menuId, roleId },
    });
  }

  console.log(`Assigned ${menuIds.length} menus to role "${roleId}".`);
}

async function seedRoles(appId: string) {
  console.log("Seeding roles...");

  const roleDefinitions = [
    {
      name: "Administrator",
      code: "admin",
      authRole: "admin",
      flags: [BUILTIN_ROLE_FLAG],
    },
    {
      name: "User",
      code: "user",
      authRole: "user",
      flags: [BUILTIN_ROLE_FLAG],
    },
  ];

  const roleIds: Record<string, string> = {};

  for (const def of roleDefinitions) {
    const role = await prisma.role.upsert({
      where: { appId_code: { appId, code: def.code } },
      update: {
        name: def.name,
        authRole: def.authRole,
        flags: def.flags,
      },
      create: {
        appId,
        name: def.name,
        code: def.code,
        authRole: def.authRole,
        flags: def.flags,
      },
    });
    roleIds[def.code] = role.id;
  }

  console.log(`Seeded ${Object.keys(roleIds).length} roles.`);
  return roleIds;
}

async function seedUser(params: {
  id: string;
  name: string;
  email: string;
  password: string;
  globalRole: string;
  flags?: string[];
}) {
  const user = await prisma.user.upsert({
    where: { email: params.email },
    update: { role: params.globalRole, flags: params.flags ?? [] },
    create: {
      id: params.id,
      name: params.name,
      email: params.email,
      emailVerified: true,
      role: params.globalRole,
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

  console.log(`User ready: ${params.email} (role: ${params.globalRole})`);
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
      update: { label: config.label, description: config.description },
      create: config,
    });
  }

  console.log(`Seeded ${defaultConfigs.length} default configurations.`);

  // Seed application, menus, roles, and menu roles
  const adminApp = await seedAdminApplication();
  const menuIds = await seedMenus(adminApp.id);
  const roleIds = await seedRoles(adminApp.id);
  await seedMenuRoles(menuIds, roleIds.admin);

  // Seed users
  const adminUser = await seedUser({
    id: "admin",
    name: "Admin",
    email: "admin@system.local",
    password: "admin123",
    globalRole: "admin",
    flags: [BUILTIN_USER_FLAG],
  });
  await seedUserRole(adminUser.id, roleIds.admin);
}

seed()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
