import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./prisma/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

async function main() {
  const items = await prisma.systemConfig.findMany({
    select: { key: true, label: true },
  });
  for (const item of items) {
    console.log(`${item.key} | label=${item.label}`);
  }
  await prisma.$disconnect();
}
main();
