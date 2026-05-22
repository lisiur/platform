import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
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
      id: "app-admin",
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
      id: "menu-dashboard",
      name: "Dashboard",
      code: "dashboard",
      icon: "LayoutDashboard",
      url: "/dashboard",
      sortOrder: 0,
    },
    {
      id: "menu-applications",
      name: "Applications",
      code: "applications",
      icon: "Layers",
      url: "/applications",
      sortOrder: 1,
    },
    {
      id: "menu-organizations",
      name: "Organizations",
      code: "organizations",
      icon: "Building2",
      url: "/organizations",
      sortOrder: 2,
    },
    {
      id: "menu-users",
      name: "Users",
      code: "users",
      icon: "Users",
      url: "/users",
      sortOrder: 3,
    },
    {
      id: "menu-settings",
      name: "Settings",
      code: "settings",
      icon: "Settings",
      url: "/settings",
      sortOrder: 4,
    },
  ];

  const menuIds: string[] = [];

  for (const menu of menuDefinitions) {
    await prisma.menu.upsert({
      where: { id: menu.id },
      update: {
        name: menu.name,
        icon: menu.icon,
        url: menu.url,
        sortOrder: menu.sortOrder,
      },
      create: {
        id: menu.id,
        appId,
        name: menu.name,
        code: menu.code,
        icon: menu.icon,
        url: menu.url,
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
    { name: "Administrator", code: "admin" },
    { name: "Manager", code: "manager" },
    { name: "User", code: "user" },
  ];

  const roleIds: Record<string, string> = {};

  for (const def of roleDefinitions) {
    const role = await prisma.role.upsert({
      where: { appId_code: { appId, code: def.code } },
      update: { name: def.name },
      create: { appId, name: def.name, code: def.code },
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
}) {
  const user = await prisma.user.upsert({
    where: { email: params.email },
    update: { role: params.globalRole },
    create: {
      id: params.id,
      name: params.name,
      email: params.email,
      emailVerified: true,
      role: params.globalRole,
    },
  });

  const hashedPassword = await hashPassword(params.password);
  const existingAccount = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "email" },
  });

  if (existingAccount) {
    await prisma.account.update({
      where: { id: existingAccount.id },
      data: { password: hashedPassword },
    });
  } else {
    await prisma.account.create({
      data: {
        accountId: params.email,
        providerId: "email",
        userId: user.id,
        password: hashedPassword,
      },
    });
  }

  console.log(`User ready: ${params.email} (role: ${params.globalRole})`);
  return user;
}

async function seedUserRoles(userId: string, roleIds: Record<string, string>) {
  for (const roleId of Object.values(roleIds)) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      update: {},
      create: { userId, roleId },
    });
  }
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
    id: "user-admin",
    name: "Admin",
    email: "admin@system.local",
    password: "admin123",
    globalRole: "admin",
  });
  await seedUserRoles(adminUser.id, roleIds);

  const managerUser = await seedUser({
    id: "user-manager",
    name: "Manager",
    email: "manager@system.local",
    password: "admin123",
    globalRole: "manager",
  });
  await seedUserRoles(managerUser.id, roleIds);
}

seed()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
