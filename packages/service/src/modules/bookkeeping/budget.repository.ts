import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";

/**
 * Persistence for the ledger's year-scoped budget: one row per year (the
 * monthly amount that applies to every month of that year) plus optional
 * single-month overrides. Closing a year deletes its row; the overrides
 * cascade with it.
 */
export const budgetRepository = {
  /** The year row with its overrides (month-ascending) — the settings and
   *  report resolution input. */
  findYear(
    ledgerId: string,
    year: number,
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.ledgerBudgetYear.findUnique({
      where: { ledgerId_year: { ledgerId, year } },
      include: { months: { orderBy: { month: "asc" } } },
    });
  },

  upsertYear(
    ledgerId: string,
    data: { year: number; cents: number },
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.ledgerBudgetYear.upsert({
      where: { ledgerId_year: { ledgerId, year: data.year } },
      update: { cents: data.cents },
      create: { ledgerId, year: data.year, cents: data.cents },
    });
  },

  upsertMonthOverride(
    budgetYearId: string,
    data: { month: number; cents: number },
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.ledgerBudgetMonthOverride.upsert({
      where: { budgetYearId_month: { budgetYearId, month: data.month } },
      update: { cents: data.cents },
      create: { budgetYearId, month: data.month, cents: data.cents },
    });
  },

  deleteYear(
    ledgerId: string,
    year: number,
    tx: Prisma.TransactionClient = prisma,
  ) {
    // The month overrides cascade with the year row.
    return tx.ledgerBudgetYear.deleteMany({ where: { ledgerId, year } });
  },

  setExcludedAccountIds(
    ledgerId: string,
    accountIds: string[],
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.ledger.update({
      where: { id: ledgerId },
      data: { budgetExcludedAccountIds: accountIds },
    });
  },
};
