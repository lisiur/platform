import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
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
}

seed()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
