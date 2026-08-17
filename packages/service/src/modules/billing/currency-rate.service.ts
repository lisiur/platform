import { HTTPException } from "hono/http-exception";
import { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";
import { setLastCurrencySync } from "./billing.service";

const API_VERSION = "v1";
const MAX_STORABLE_RATE = 1e18;

async function upsertMany(rows: { currency: string; rate: number }[]) {
  if (rows.length === 0) return;
  const now = new Date();
  const values = rows.map(
    (row) =>
      Prisma.sql`(${row.currency}, ${row.rate}, 'active', ${now}, ${now})`,
  );
  await prisma.$executeRaw`
    INSERT INTO currency_rate (currency, rate, status, "createdAt", "updatedAt")
    VALUES ${Prisma.join(values)}
    ON CONFLICT (currency) DO UPDATE
    SET rate = EXCLUDED.rate,
        status = EXCLUDED.status,
        "updatedAt" = EXCLUDED."updatedAt"
  `;
}

function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase();
}

/**
 * Upserts rate rows (active) using the same conflict path as `syncCurrencyRates`.
 * Used by the seed to establish initial rates without hitting the external API.
 */
export async function upsertCurrencyRates(
  rows: { currency: string; rate: number }[],
) {
  await upsertMany(
    rows.map((row) => ({
      currency: normalizeCurrency(row.currency),
      rate: row.rate,
    })),
  );
}

function serializeCurrencyRate(row: {
  currency: string;
  rate: unknown;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  if (row.status !== "active" && row.status !== "disabled") {
    throw new HTTPException(400, {
      message: `Invalid rate status: ${row.status}`,
    });
  }
  const status: "active" | "disabled" = row.status;
  return { ...row, status, rate: Number(row.rate) };
}

export async function listCurrencyRates(params: {
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const where: Prisma.CurrencyRateWhereInput = {};
  if (params.search) {
    where.currency = { contains: params.search, mode: "insensitive" };
  }
  const [rates, total] = await Promise.all([
    prisma.currencyRate.findMany({
      where,
      orderBy: { currency: "asc" },
      take: params.limit ?? 20,
      skip: params.offset ?? 0,
    }),
    prisma.currencyRate.count({ where }),
  ]);
  return { rates: rates.map(serializeCurrencyRate), total };
}

export async function deleteCurrencyRate(currency: string) {
  await prisma.currencyRate.delete({
    where: { currency: normalizeCurrency(currency) },
  });
  return { success: true as const };
}

async function fetchRates(base: string) {
  const lowerBase = base.toLowerCase();
  const urls = [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/${API_VERSION}/currencies/${lowerBase}.json`,
    `https://latest.currency-api.pages.dev/${API_VERSION}/currencies/${lowerBase}.json`,
  ];
  let lastError: unknown;
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as Record<string, unknown>;
    } catch (err) {
      lastError = err;
    }
  }
  throw new HTTPException(502, {
    message: `Failed to fetch currency rates: ${String(lastError)}`,
  });
}

export async function syncCurrencyRates() {
  const base = "USD";
  const raw = await fetchRates(base);
  const lowerBase = base.toLowerCase();
  const rates = raw[lowerBase] as Record<string, unknown> | undefined;
  if (!rates || typeof rates !== "object") {
    throw new HTTPException(502, { message: "Invalid currency API response." });
  }

  const rows = Object.entries(rates)
    .map(([currency, value]) => ({
      currency: normalizeCurrency(currency),
      rate: Number(value),
    }))
    .filter(
      (row) =>
        Number.isFinite(row.rate) &&
        row.rate > 0 &&
        row.rate <= MAX_STORABLE_RATE,
    );
  const uniqueRows = new Map(rows.map((row) => [row.currency, row] as const));
  uniqueRows.set(base, { currency: base, rate: 1 });

  await upsertMany([...uniqueRows.values()]);

  const syncedAt = new Date().toISOString();
  await setLastCurrencySync(syncedAt);
  return {
    baseCurrency: base,
    synced: uniqueRows.size,
    sourceDate: typeof raw.date === "string" ? raw.date : null,
    syncedAt,
  };
}
