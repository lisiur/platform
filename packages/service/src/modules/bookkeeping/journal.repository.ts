import { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";
import {
  type AccountType,
  accountCodesMatchingLabel,
  type EntryKind,
} from "./domain";

export type EntryWindow = {
  from?: Date;
  to?: Date;
  q?: string;
  participantUserId?: string;
  /** Restrict to entries of one project. */
  projectId?: string;
  /** Restrict to entries with a line against this account (category drill-down). */
  accountId?: string;
  /** Restrict to entries with a line against an account of this type (statement flow drill-down). */
  accountType?: AccountType;
  /**
   * Restrict to one entry kind, classified the way clients render entries
   * (the dashboard's expense/income/transfer filter).
   */
  kind?: EntryKind;
  /**
   * Restrict to entries that involve this user in settlement terms: paid
   * for by them, tagged with them as a participant, or untagged while a
   * current member of the entry's project. Creation deliberately doesn't
   * match — see entryFilterWhere for the branch rationale. Pair with
   * projectId — the settlement drill-down.
   */
  memberUserId?: string;
  /** Guest scope: entries of any of these projects (forced filter). */
  scopeProjectIds?: string[];
  /**
   * Ledger-wide escape hatch: also return entries the creator opted out of
   * the ledger's surfaces (`countsInLedger = false`). Never honored for
   * project-scoped queries — a project's books always show all of its
   * entries.
   */
  includeExcluded?: boolean;
};

/**
 * List ordering. "date" (default) is the newest-first date/entryNo order;
 * "amount" orders by the entry's gross amount — the sum of its lines'
 * debits, the same figure clients render as the entry total. "order" only
 * applies to "amount" ("desc" default); date always stays descending.
 */
export type EntryOrdering = {
  sort?: "date" | "amount";
  order?: "asc" | "desc";
};

/**
 * LEDGER-WIDE (journal activity) predicate: member entries the creator kept
 * in (`countsInLedger` is the creator's personal-books intent) plus guest
 * posts — the share-based statement counts every viewer's participant share
 * of guest entries, so those entries must stay visible and drillable here.
 * Only the creator's own opt-outs are excluded.
 */
export const ledgerActivityWhere = {
  OR: [{ guestCreated: true }, { countsInLedger: true }],
} as const satisfies Prisma.JournalEntryWhereInput;

/** The [from, to] entry-date window as a where fragment — the one shape
 *  every windowed entry/line query shares. */
function dateWindowWhere(window: {
  from?: Date;
  to?: Date;
}): Prisma.JournalEntryWhereInput {
  return {
    ...(window.from || window.to
      ? {
          date: {
            ...(window.from ? { gte: window.from } : {}),
            ...(window.to ? { lte: window.to } : {}),
          },
        }
      : {}),
  };
}

/** The share-statement entry shape: payer, typed lines, participant ids —
 *  everything the split math reads, nothing else. */
const shareEntrySelect = {
  paidById: true,
  lines: {
    select: {
      accountId: true,
      debit: true,
      credit: true,
      account: { select: { type: true } },
    },
  },
  participants: {
    select: { userId: true },
  },
} as const satisfies Prisma.JournalEntrySelect;

/**
 * Window + visibility options for `sumLinesByAccount`, shared with its
 * callers so the shapes can't drift.
 */
export interface SumLinesWindow {
  from?: Date;
  to?: Date;
  countsInLedger?: boolean;
  guestCreated?: boolean;
}

/** Participant rows with the user's profile, as returned on entries. */
const participantInclude = {
  user: {
    select: { id: true, name: true, email: true, avatar: true },
  },
} as const satisfies Prisma.JournalEntryParticipantInclude;

/**
 * The lines clause implementing one entry kind. Classification mirrors the
 * clients' rendering (an expense line wins over an income line): "income"
 * excludes entries that also carry an expense line, and "transfer" means
 * neither an expense nor an income line — only pocket-to-pocket movement.
 */
export function entryKindLines(kind: EntryKind): Prisma.JournalEntryWhereInput {
  switch (kind) {
    case "expense":
      return { lines: { some: { account: { type: "expense" } } } };
    case "income":
      return {
        lines: {
          some: { account: { type: "income" } },
          none: { account: { type: "expense" } },
        },
      };
    case "transfer":
      return {
        lines: {
          none: { account: { type: { in: ["expense", "income"] as const } } },
        },
      };
  }
}

const entryInclude = {
  lines: { include: { account: true } },
  participants: { include: participantInclude },
  createdBy: {
    select: { id: true, name: true, email: true, avatar: true },
  },
  paidBy: {
    select: { id: true, name: true, email: true, avatar: true },
  },
  project: { select: { id: true, name: true, status: true } },
} as const satisfies Prisma.JournalEntryInclude;

function entryFilterWhere(ledgerId: string, window: EntryWindow) {
  const projectScoped = Boolean(window.projectId || window.scopeProjectIds);
  // Seeded categories store name = null — clients render their label from
  // `code`, so the raw name/code contains-matches only ever hit the English
  // code text. Translate a query that hits a localized label into those
  // codes to restore category search for both languages.
  const labelMatchedCodes = window.q ? accountCodesMatchingLabel(window.q) : [];
  // AND-wrapped predicates, collected so several can coexist (memberUserId
  // and the kind filter are independent).
  const andFilters: Prisma.JournalEntryWhereInput[] = [];
  if (window.memberUserId) {
    // The untagged branch requires current project membership: untagged
    // splits run across current members, so entries a departed member's
    // settlement math never touched must not appear in their drill-down.
    // Creation is deliberately absent: the settlement math weights only
    // the payer (paidById) and the split set (participants), so a
    // created-only entry has nothing to reconcile and stays off the page.
    andFilters.push({
      OR: [
        { paidById: window.memberUserId },
        {
          participants: {
            some: { userId: window.memberUserId },
          },
        },
        {
          participants: { none: {} },
          project: {
            members: { some: { userId: window.memberUserId } },
          },
        },
      ],
    });
  }
  if (window.kind) {
    andFilters.push(entryKindLines(window.kind));
  }
  return {
    ledgerId,
    // The ledger-activity predicate scopes LEDGER-WIDE surfaces only
    // (journal list, dashboard recent entries): member entries the creator
    // kept in plus every guest post, so entries that feed the share-based
    // statement stay visible and drillable. Only the creator's own opt-outs
    // are excluded (and even those return via `includeExcluded`). Project
    // books always show all of their entries — settlement depends on them —
    // so the filter is skipped whenever the query is pinned to project(s).
    ...(!projectScoped && !window.includeExcluded ? ledgerActivityWhere : {}),
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
    // AND-wrapped so the ORs never collide with `q`'s own top-level OR.
    ...(andFilters.length ? { AND: andFilters } : {}),
    ...(window.scopeProjectIds
      ? { projectId: { in: window.scopeProjectIds } }
      : {}),
    ...(window.q
      ? {
          OR: [
            { memo: { contains: window.q, mode: "insensitive" as const } },
            { address: { contains: window.q, mode: "insensitive" as const } },
            {
              addressName: {
                contains: window.q,
                mode: "insensitive" as const,
              },
            },
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
            ...(labelMatchedCodes.length
              ? [
                  {
                    lines: {
                      some: {
                        account: { code: { in: labelMatchedCodes } },
                      },
                    },
                  },
                ]
              : []),
          ],
        }
      : {}),
    ...(window.participantUserId
      ? {
          participants: {
            some: { userId: window.participantUserId },
          },
        }
      : {}),
  };
}

/**
 * One entry's amount plus the fallback keys that make the order total:
 * amount ties fall back to the date listing's own order (date/entryNo
 * descending), so equal-amount entries hold one deterministic position on
 * every page fetch.
 */
type EntryAmountRow = {
  entryId: string;
  sum: Prisma.Decimal | null;
  date: Date;
  entryNo: number;
};

/**
 * Pure amount ordering. Primary key is the entry's gross amount (the sum
 * of its lines' debits); ties keep the default list's date-desc/entryNo-desc
 * order regardless of the amount direction, so ascending and descending
 * agree on where ties sit. Array.sort's stability is the last resort only —
 * entryNo is unique per ledger, so real rows never reach it.
 */
export function orderByAmount(
  rows: EntryAmountRow[],
  order: "asc" | "desc",
): EntryAmountRow[] {
  return [...rows].sort((a, b) => {
    const compared = (a.sum ?? zero).comparedTo(b.sum ?? zero);
    if (compared !== 0) return order === "asc" ? compared : -compared;
    return b.date.getTime() - a.date.getTime() || b.entryNo - a.entryNo;
  });
}

const zero = new Prisma.Decimal(0);

/**
 * Amount-ordered listing: lines are grouped per entry with the debit sum
 * aggregated in SQL, a light fetch supplies each entry's date/entryNo for
 * the tiebreak, the full match set is ordered deterministically
 * (see `orderByAmount`), then one page's ids are fetched with the standard
 * include and re-ordered to match. Pagination stays offset-consistent
 * because every page re-sorts the same complete set; the extra work is
 * bounded by the caller's window (the dashboard's month).
 */
async function listEntriesByAmount(
  ledgerId: string,
  opts: { limit?: number; offset?: number } & EntryWindow & EntryOrdering,
  tx: Prisma.TransactionClient,
) {
  const where = entryFilterWhere(ledgerId, opts);
  const [groups, keys] = await Promise.all([
    tx.journalLine.groupBy({
      by: ["entryId"],
      where: { entry: where },
      _sum: { debit: true },
    }),
    tx.journalEntry.findMany({
      where,
      select: { id: true, date: true, entryNo: true },
    }),
  ]);
  const keysById = new Map(keys.map((key) => [key.id, key]));
  const rows: EntryAmountRow[] = [];
  for (const group of groups) {
    const key = keysById.get(group.entryId);
    if (key) {
      rows.push({
        entryId: group.entryId,
        sum: group._sum.debit,
        date: key.date,
        entryNo: key.entryNo,
      });
    }
  }
  const offset = opts.offset ?? 0;
  const end = opts.limit === undefined ? undefined : offset + opts.limit;
  const pageIds = orderByAmount(rows, opts.order === "asc" ? "asc" : "desc")
    .slice(offset, end)
    .map((row) => row.entryId);
  if (pageIds.length === 0) return [];
  const rowsById = await tx.journalEntry.findMany({
    where: { id: { in: pageIds } },
    include: entryInclude,
  });
  const byId = new Map(rowsById.map((row) => [row.id, row]));
  return pageIds.map((id) => byId.get(id)).filter((row) => row !== undefined);
}

export const journalRepository = {
  listEntries(
    ledgerId: string,
    opts: { limit?: number; offset?: number } & EntryWindow & EntryOrdering,
    tx: Prisma.TransactionClient = prisma,
  ) {
    if (opts.sort === "amount") {
      return listEntriesByAmount(ledgerId, opts, tx);
    }
    // order applies to the date listing too: asc = oldest first (the
    // journal's window display walks the ledger's extent with limit=1),
    // desc (default) stays newest first. entryNo flips with the date so
    // the tiebreak keeps the listing deterministic in both directions.
    const direction = opts.order === "asc" ? "asc" : "desc";
    return tx.journalEntry.findMany({
      where: entryFilterWhere(ledgerId, opts),
      include: entryInclude,
      take: opts.limit,
      skip: opts.offset,
      orderBy: [{ date: direction }, { entryNo: direction }],
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
      /** Who fronted the money; the service resolves the creator default. */
      paidById: string;
      projectId?: string;
      countsInLedger?: boolean;
      /** System guest rule, set once at posting. */
      guestCreated?: boolean;
      /** Flat location columns; omitted fields store as null. */
      address?: string | null;
      addressName?: string | null;
      latitude?: Prisma.Decimal | null;
      longitude?: Prisma.Decimal | null;
      lines: Array<{
        accountId: string;
        debit: Prisma.Decimal | number;
        credit: Prisma.Decimal | number;
        memo?: string;
      }>;
      participantUserIds?: string[];
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
        paidById: data.paidById,
        projectId: data.projectId,
        countsInLedger: data.countsInLedger ?? true,
        guestCreated: data.guestCreated ?? false,
        address: data.address ?? null,
        addressName: data.addressName ?? null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        lines: { create: data.lines },
        participants: {
          create: (data.participantUserIds ?? []).map((userId) => ({
            userId,
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
   * update fully specifies them. `paidById` is written whenever given
   * (including null — the service resolves null = reset to creator);
   * absent = keep the current payer, so clients that don't know the field
   * can't strip it.
   */
  updateEntry(
    id: string,
    data: {
      date: Date;
      memo?: string | null;
      /** Reassigns who fronted the money; absent = keep the current payer. */
      paidById?: string | null;
      projectId?: string | null;
      /** Required: the service resolves guest pinning and keep-on-omit. */
      countsInLedger: boolean;
      /**
       * Full replacement location (parts may be null). Absent = keep the
       * stored location — the service resolves keep-on-omit vs clear.
       */
      location?: {
        address: string | null;
        addressName: string | null;
        latitude: Prisma.Decimal | null;
        longitude: Prisma.Decimal | null;
      };
      lines: Array<{
        accountId: string;
        debit: Prisma.Decimal | number;
        credit: Prisma.Decimal | number;
        memo?: string;
      }>;
      participantUserIds: string[];
    },
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.journalEntry.update({
      where: { id },
      data: {
        date: data.date,
        memo: data.memo ?? null,
        ...(data.paidById !== undefined ? { paidById: data.paidById } : {}),
        projectId: data.projectId ?? null,
        countsInLedger: data.countsInLedger,
        ...(data.location
          ? {
              address: data.location.address,
              addressName: data.location.addressName,
              latitude: data.location.latitude,
              longitude: data.location.longitude,
            }
          : {}),
        lines: { deleteMany: {}, create: data.lines },
        participants: {
          deleteMany: {},
          create: data.participantUserIds.map((userId) => ({
            userId,
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
   * Accounting truth by default: trial balance, net worth, and
   * balance-as-of pass no flags, so every posted entry is summed —
   * opted-out and guest entries included. The `countsInLedger` /
   * `guestCreated` flag-equality filters stay opt-in for a future caller;
   * the behavioral statements are computed elsewhere, share-based, via
   * `listShareEntries` (per viewer) and `listActivityEntries` (member set).
   */
  sumLinesByAccount(
    ledgerId: string,
    window: SumLinesWindow = {},
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
          ...(window.guestCreated !== undefined
            ? { guestCreated: window.guestCreated }
            : {}),
          ...dateWindowWhere(window),
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
   * Prisma can't groupBy a relation key like userId.
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
        participants: { select: { userId: true } },
        lines: { select: { debit: true } },
      },
    });
  },

  listRecent(
    ledgerId: string,
    limit: number,
    opts: { includeExcluded?: boolean } = {},
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.journalEntry.findMany({
      where: entryFilterWhere(ledgerId, {
        includeExcluded: opts.includeExcluded,
      }),
      include: entryInclude,
      take: limit,
      orderBy: [{ date: "desc" }, { entryNo: "desc" }],
    });
  },

  /**
   * Every entry of a project with the shape the settlement report needs:
   * raw lines (account types classify the flow), participants as userIds
   * (the split set — anchored to User, so departed members still carry
   * their historical share), and the payer (who fronted the money — not
   * necessarily the creator).
   */
  listByProject(projectId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.journalEntry.findMany({
      where: { projectId },
      select: {
        paidById: true,
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
          select: { userId: true },
        },
      },
      orderBy: [{ date: "asc" }, { entryNo: "asc" }],
    });
  },

  /**
   * Entries that feed the viewer's share-based statement ("my actual
   * spending"): project entries the viewer participates in — including
   * guest-created ones, whose participant shares are real consumption —
   * plus untagged entries the viewer paid for, where the payer bears the
   * full value (the payer is not always the creator). The viewer's own
   * opted-out entries stay out everywhere (a repayment already expensed at
   * purchase must not count twice); other members' countsInLedger flags
   * are their personal-books intent and must not touch the viewer's share.
   * Untagged PROJECT entries are excluded: the split-set freeze
   * (auto-tagging at posting) means only legacy rows can be untagged, and
   * their honest split set (members at read time) is not resolvable in
   * this ledger-wide query.
   */
  listShareEntries(
    ledgerId: string,
    viewerUserId: string,
    window: { from?: Date; to?: Date } = {},
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.journalEntry.findMany({
      where: {
        ledgerId,
        ...dateWindowWhere(window),
        OR: [
          {
            // Project entries I participate in — unless I paid for the
            // entry and it carries the countsInLedger opt-out. The flag is
            // entry-level (set by whichever editor saved last), so keyed on
            // the payer it pulls the entry from the payer's statement
            // regardless of who set it.
            projectId: { not: null },
            participants: {
              some: { userId: viewerUserId },
            },
            NOT: {
              AND: [{ paidById: viewerUserId }, { countsInLedger: false }],
            },
          },
          {
            // Untagged entries I paid for: personal books, payer bears all.
            projectId: null,
            paidById: viewerUserId,
            countsInLedger: true,
          },
        ],
      },
      select: shareEntrySelect,
    });
  },

  /**
   * Every activity-visible entry of the ledger in the window, in the
   * share-statement shape (lines with account types, participants, payer).
   * The ledger-wide share-based statement (dashboard month cards) splits
   * each entry across its participant set and counts only the ledger
   * members' shares, so it needs EVERY entry — not one viewer's subset —
   * under the journal list's own visibility rule (guest posts stay in even
   * when opted out; only non-guest opt-outs drop). Project outsiders have
   * no roster row, so their shares fall out of the member set naturally.
   */
  listActivityEntries(
    ledgerId: string,
    window: { from?: Date; to?: Date } = {},
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.journalEntry.findMany({
      where: {
        ledgerId,
        ...ledgerActivityWhere,
        ...dateWindowWhere(window),
      },
      select: shareEntrySelect,
    });
  },

  /**
   * Entries still anchored to this user as creator or payer. Nonzero means
   * the User row must survive a member removal — historical settlement reads
   * those anchors (payer credit, untagged-share fallback).
   */
  countEntriesAnchoringUser(
    userId: string,
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.journalEntry.count({
      where: { OR: [{ createdById: userId }, { paidById: userId }] },
    });
  },

  /** Participant tags pointing at this user. */
  countParticipationsByUser(
    userId: string,
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.journalEntryParticipant.count({ where: { userId } });
  },
};
