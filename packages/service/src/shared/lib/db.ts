import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "#generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    statement_timeout: Number(
      process.env.DATABASE_STATEMENT_TIMEOUT_MS ?? 30_000,
    ),
    idle_in_transaction_session_timeout: Number(
      process.env.DATABASE_IDLE_TXN_TIMEOUT_MS ?? 30_000,
    ),
    connectionTimeoutMillis: Number(
      process.env.DATABASE_CONNECT_TIMEOUT_MS ?? 5_000,
    ),
  });
  return new PrismaClient({
    adapter,
    log: ["warn", "error"],
  });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
