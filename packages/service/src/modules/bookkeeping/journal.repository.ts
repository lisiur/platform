import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";
import type { AccountType } from "./domain";

export type EntryWindow = {
  from?: Date;
  to?: Date;
  q?: string;
  participantMemberId?: string;
  /** Restrict to entries of one project. */
  projectId?: string;
  /** Restrict to entries with a line against this account (category drill-down). */
  accountId?: string;
  /** Restrict to entries with a line against an account of this type (statement flow drill-down). */
  accountType?: AccountType;
  /**
   * Restrict to entries that involve this user in settlement terms: created
   * by them, tagged with them as a participant, or untagged — untagged
   * entries count only while the user is a current member of the entry's
   * project, because untagged splits run across current members. Pair with
   * projectId — the settlement drill-down.
   */
  memberUserId?: string;
  /** Guest scope: entries of any of these projects (forced filter). */
  scopeProjectIds?: string[];
  /**
   * Ledger-wide escape hatch: also return entries flagged
   * `countsInLedger = false`. Never honored for project-scoped queries —
   * a project's books always show all of its entries.
   */
  includeExcluded?: boolean;
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
  project: { select: { id: true, name: true, status: true } },
} as const satisfies Prisma.JournalEntryInclude;

function entryFilterWhere(ledgerId: string, window: EntryWindow) {
  const projectScoped = Boolean(window.projectId || window.scopeProjectIds);
  return {
    ledgerId,
    // The countsInLedger flag scopes LEDGER-WIDE surfaces only (journal,
    // dashboard month, income statement). Project books always show all of
    // their entries — settlement depends on them — so the filter is skipped
    // whenever the query is pinned to project(s).
    ...(!projectScoped && !window.includeExcluded
      ? { countsInLedger: true }
      : {}),
    ...(window.from || window.to
      ? {
          date: {
            ...(window.from ? { gte: window.from } : {}),
            ...(window.to ? { lte: window.to } : {}),
          },
        }
      : {}),
    ...(window.projectId ? { projectId: window.projectId } : {}),
    ...(window.accountId || window.accountType
      ? {
          lines: {
            some: {
              ...(window.accountId ? { accountId: window.accountId } : {}),
              ...(window.accountType
                ? { account: { type: window.accountType } }
                : {}),
            },
          },
        }
      : {}),
    // AND-wrapped so the OR never collides with `q`'s own top-level OR.
    // The untagged branch requires current project membership: untagged
    // splits run across current members, so entries a departed member's
    // settlement math never touched must not appear in their drill-down.
    ...(window.memberUserId
      ? {
          AND: [
            {
              OR: [
                { createdById: window.memberUserId },
                {
                  participants: {
                    some: { ledgerMember: { userId: window.memberUserId } },
                  },
                },
                {
                  participants: { none: {} },
                  project: {
                    members: { some: { userId: window.memberUserId } },
                  },
                },
              ],
            },
          ],
        }
      : {}),
    ...(window.scopeProjectIds
      ? { projectId: { in: window.scopeProjectIds } }
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
    ...(window.participantMemberId
      ? {
          participants: {
            some: { ledgerMemberId: window.participantMemberId },
          },
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
      projectId?: string;
      countsInLedger?: boolean;
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
        projectId: data.projectId,
        countsInLedger: data.countsInLedger ?? true,
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

  /**
   * Replaces an entry's mutable surface — date, memo, lines, and
   * participants — in one shot; entryNo and the original creator stay
   * untouched. Lines and participants are wiped and recreated so the
   * update fully specifies them.
   */
  updateEntry(
    id: string,
    data: {
      date: Date;
      memo?: string | null;
      projectId?: string | null;
      /** Required: the service resolves guest pinning and keep-on-omit. */
      countsInLedger: boolean;
      lines: Array<{
        accountId: string;
        debit: Prisma.Decimal | number;
        credit: Prisma.Decimal | number;
        memo?: string;
      }>;
      participantMemberIds: string[];
    },
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.journalEntry.update({
      where: { id },
      data: {
        date: data.date,
        memo: data.memo ?? null,
        projectId: data.projectId ?? null,
        countsInLedger: data.countsInLedger,
        lines: { deleteMany: {}, create: data.lines },
        participants: {
          deleteMany: {},
          create: data.participantMemberIds.map((ledgerMemberId) => ({
            ledgerMemberId,
          })),
        },
      },
      include: entryInclude,
    });
  },

  deleteByLedger(ledgerId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.journalEntry.deleteMany({ where: { ledgerId } });
  },

  /**
   * Sums debit/credit per account for a ledger, optionally restricted to
   * entries dated within [from, to]. Grouped on JournalLine with the entry
   * relation filtered, so each account's totals reflect only this ledger.
   *
   * `countsInLedger` is opt-in and explicit: pass `true` for behavioral
   * statements (income statement, dashboard month) so flagged-out entries
   * don't count, and leave it undefined for accounting truth (trial balance,
   * net worth) where every posted entry must be summed.
   */
  sumLinesByAccount(
    ledgerId: string,
    window: { from?: Date; to?: Date; countsInLedger?: boolean } = {},
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.journalLine.groupBy({
      by: ["accountId"],
      where: {
        account: { ledgerId },
        entry: {
          ...(window.countsInLedger !== undefined
            ? { countsInLedger: window.countsInLedger }
            : {}),
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
    opts: { countsInLedger?: boolean } = {},
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.journalEntry.findMany({
      where: {
        ledgerId,
        ...(opts.countsInLedger !== undefined
          ? { countsInLedger: opts.countsInLedger }
          : {}),
      },
      include: entryInclude,
      take: limit,
      orderBy: [{ date: "desc" }, { entryNo: "desc" }],
    });
  },

  /**
   * Every entry of a project with the shape the settlement report needs:
   * raw lines (account types classify the flow), participants as member
   * userIds (the split set), and the creator (who fronted the money).
   */
  listByProject(projectId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.journalEntry.findMany({
      where: { projectId },
      select: {
        createdById: true,
        lines: {
          select: {
            debit: true,
            credit: true,
            account: {
              select: {
                id: true,
                name: true,
                code: true,
                type: true,
                sortOrder: true,
                icon: true,
              },
            },
          },
        },
        participants: {
          select: { ledgerMember: { select: { userId: true } } },
        },
      },
      orderBy: [{ date: "asc" }, { entryNo: "asc" }],
    });
  },
};
