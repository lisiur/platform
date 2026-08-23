import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";

export type EntryWindow = {
  from?: Date;
  to?: Date;
  q?: string;
};

function entryFilterWhere(ledgerId: string, window: EntryWindow) {
  return {
    ledgerId,
    ...(window.from || window.to
      ? {
          date: {
            ...(window.from ? { gte: window.from } : {}),
            ...(window.to ? { lte: window.to } : {}),
          },
        }
      : {}),
    ...(window.q
      ? {
          OR: [
            { memo: { contains: window.q, mode: "insensitive" as const } },
            {
              lines: {
                some: {
                  OR: [
                    {
                      memo: {
                        contains: window.q,
                        mode: "insensitive" as const,
                      },
                    },
                    {
                      account: {
                        name: {
                          contains: window.q,
                          mode: "insensitive" as const,
                        },
                      },
                    },
                  ],
                },
              },
            },
          ],
        }
      : {}),
  };
}

export const journalRepository = {
  listEntries(
    ledgerId: string,
    opts: { limit?: number; offset?: number } & EntryWindow,
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.journalEntry.findMany({
      where: entryFilterWhere(ledgerId, opts),
      include: {
        lines: { include: { account: true } },
        createdBy: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
      take: opts.limit,
      skip: opts.offset,
      orderBy: [{ date: "desc" }, { entryNo: "desc" }],
    });
  },

  countEntries(
    ledgerId: string,
    window: EntryWindow = {},
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.journalEntry.count({ where: entryFilterWhere(ledgerId, window) });
  },

  findById(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.journalEntry.findUnique({
      where: { id },
      include: {
        lines: { include: { account: true } },
        createdBy: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
    });
  },

  createEntry(
    data: {
      ledgerId: string;
      entryNo: number;
      date: Date;
      memo?: string;
      createdById: string;
      lines: Array<{
        accountId: string;
        debit: Prisma.Decimal | number;
        credit: Prisma.Decimal | number;
        memo?: string;
      }>;
    },
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.journalEntry.create({
      data: {
        ledgerId: data.ledgerId,
        entryNo: data.entryNo,
        date: data.date,
        memo: data.memo,
        createdById: data.createdById,
        lines: { create: data.lines },
      },
      include: {
        lines: { include: { account: true } },
        createdBy: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
    });
  },

  delete(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.journalEntry.delete({ where: { id } });
  },

  deleteByLedger(ledgerId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.journalEntry.deleteMany({ where: { ledgerId } });
  },

  /**
   * Sums debit/credit per account for a ledger, optionally restricted to
   * entries dated within [from, to]. Grouped on JournalLine with the entry
   * relation filtered, so each account's totals reflect only this ledger.
   */
  sumLinesByAccount(
    ledgerId: string,
    window: { from?: Date; to?: Date } = {},
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.journalLine.groupBy({
      by: ["accountId"],
      where: {
        account: { ledgerId },
        entry: {
          date: {
            ...(window.from ? { gte: window.from } : {}),
            ...(window.to ? { lte: window.to } : {}),
          },
        },
      },
      _sum: { debit: true, credit: true },
    });
  },

  listRecent(
    ledgerId: string,
    limit: number,
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.journalEntry.findMany({
      where: { ledgerId },
      include: {
        lines: { include: { account: true } },
        createdBy: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
      take: limit,
      orderBy: [{ date: "desc" }, { entryNo: "desc" }],
    });
  },
};
