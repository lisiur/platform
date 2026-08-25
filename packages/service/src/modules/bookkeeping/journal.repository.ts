import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";

export type EntryWindow = {
  from?: Date;
  to?: Date;
  q?: string;
};

/** Participant rows with the member's user profile, as returned on entries. */
const participantInclude = {
  ledgerMember: {
    include: {
      user: { select: { id: true, name: true, email: true, avatar: true } },
    },
  },
} as const satisfies Prisma.JournalEntryParticipantInclude;

const entryInclude = {
  lines: { include: { account: true } },
  participants: { include: participantInclude },
  createdBy: {
    select: { id: true, name: true, email: true, avatar: true },
  },
} as const satisfies Prisma.JournalEntryInclude;

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
                        OR: [
                          {
                            name: {
                              contains: window.q,
                              mode: "insensitive" as const,
                            },
                          },
                          {
                            code: {
                              contains: window.q,
                              mode: "insensitive" as const,
                            },
                          },
                        ],
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
      include: entryInclude,
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
      include: entryInclude,
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
      participantMemberIds?: string[];
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
        participants: {
          create: (data.participantMemberIds ?? []).map((ledgerMemberId) => ({
            ledgerMemberId,
          })),
        },
      },
      include: entryInclude,
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

  /**
   * Per-participant turnover input: entries of the ledger dated within
   * [from, to] that have at least one participant, with each entry's
   * participant ids and raw lines (whose debit sum is the entry's gross
   * amount). The per-member aggregation itself runs in the service —
   * Prisma can't groupBy a relation key like ledgerMemberId.
   */
  listTaggedEntries(
    ledgerId: string,
    window: { from?: Date; to?: Date } = {},
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.journalEntry.findMany({
      where: {
        ledgerId,
        participants: { some: {} },
        ...(window.from || window.to
          ? {
              date: {
                ...(window.from ? { gte: window.from } : {}),
                ...(window.to ? { lte: window.to } : {}),
              },
            }
          : {}),
      },
      select: {
        participants: { select: { ledgerMemberId: true } },
        lines: { select: { debit: true } },
      },
    });
  },

  listRecent(
    ledgerId: string,
    limit: number,
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.journalEntry.findMany({
      where: { ledgerId },
      include: entryInclude,
      take: limit,
      orderBy: [{ date: "desc" }, { entryNo: "desc" }],
    });
  },
};
