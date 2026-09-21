import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";

/**
 * Persistence for the ledger's per-category annual budgets (see
 * LedgerCategoryBudgetYear): one row per (year, category), fully isolated
 * from the year/month budget tables. Deleting the ledger or the category
 * cascades the rows away; there is no close-the-year switch.
 */
export const categoryBudgetRepository = {
  /** The year's rows — the settings, the carry-over prefill (pass year-1),
   *  and the report's budget side. */
  listByYear(
    ledgerId: string,
    year: number,
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.ledgerCategoryBudgetYear.findMany({
      where: { ledgerId, year },
      orderBy: [{ accountId: "asc" }],
    });
  },

  upsert(
    ledgerId: string,
    data: { year: number; accountId: string; cents: number },
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.ledgerCategoryBudgetYear.upsert({
      where: {
        ledgerId_year_accountId: {
          ledgerId,
          year: data.year,
          accountId: data.accountId,
        },
      },
      update: { cents: data.cents },
      create: {
        ledgerId,
        year: data.year,
        accountId: data.accountId,
        cents: data.cents,
      },
    });
  },

  delete(
    ledgerId: string,
    data: { year: number; accountId: string },
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.ledgerCategoryBudgetYear.deleteMany({
      where: { ledgerId, year: data.year, accountId: data.accountId },
    });
  },
};
