import { HTTPException } from "hono/http-exception";
import type { BookAccount } from "#generated/prisma/client";
import { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";
import {
  assertLedgerWritable,
  type LedgerAccess,
  resolveEntryProjectTarget,
} from "./access";
import { accountRepository } from "./account.repository";
import {
  DEFAULT_CREDIT_ACCOUNT_FLAG,
  DEFAULT_DEBIT_ACCOUNT_FLAG,
  hasAccountFlag,
  type LedgerRole,
  MAX_LINE_CENTS,
} from "./domain";
import { type EntryWindow, journalRepository } from "./journal.repository";
import { ledgerRepository, lockLedgerRow } from "./ledger.repository";
import { ledgerMemberRepository } from "./ledger-member.repository";
import { isForeignKeyViolation } from "./prisma-errors";
import { projectRepository } from "./project.repository";

export type JournalLineInput = {
  /**
   * Null/omitted when the caller defers to the ledger's default pocket for
   * this line's side (quick entry leaves the pay account unselected).
   */
  accountId?: string | null;
  debit: number;
  credit: number;
  memo?: string;
};

/** A validated journal line with amounts normalized to integer cents. */
export type NormalizedJournalLine = {
  accountId: string;
  debitCents: number;
  creditCents: number;
  memo?: string;
};

/**
 * Where an entry was recorded, resolved on the client and stored as-is.
 * Pure annotation: never enters balances, settlement, or reports.
 */
export type EntryLocationInput = {
  address?: string;
  addressName?: string;
  latitude?: number;
  longitude?: number;
};

/**
 * Flattens the API's nested location into the entry's columns. Coordinates
 * are rounded to the stored 6 decimal places so what is validated is
 * exactly what gets stored; an absent location maps to no columns at all
 * (create: entry without a location).
 */
function locationColumns(location?: EntryLocationInput | null) {
  if (!location) return {};
  return {
    address: location.address ?? null,
    addressName: location.addressName ?? null,
    latitude:
      location.latitude !== undefined
        ? new Prisma.Decimal(location.latitude.toFixed(6))
        : null,
    longitude:
      location.longitude !== undefined
        ? new Prisma.Decimal(location.longitude.toFixed(6))
        : null,
  };
}

/**
 * Pure validation of journal lines for a double-entry post:
 * - at least 2 lines
 * - each line has exactly one positive side (debit XOR credit) after rounding to cents
 * - total debits equal total credits on the rounded (i.e. stored) amounts
 * - every referenced account exists, belongs to the ledger and is active
 * - a line without an account resolves to the ledger's flagged default
 *   pocket for its side (`defaultCredit` pays, `defaultDebit` receives);
 *   400 when no such pocket is seeded
 *
 * Amounts are rounded to integer cents BEFORE balancing so what is validated
 * is exactly what gets stored. Returns the normalized lines for persistence.
 */
export function validateJournalLines(
  lines: JournalLineInput[],
  ledgerAccounts: BookAccount[],
  opts: { expenseOnly?: boolean } = {},
): NormalizedJournalLine[] {
  if (lines.length < 2) {
    throw new HTTPException(400, {
      message: "A journal entry needs at least 2 lines",
    });
  }
  const accountsById = new Map(ledgerAccounts.map((a) => [a.id, a]));
  const normalized: NormalizedJournalLine[] = [];
  let totalDebitCents = 0;
  let totalCreditCents = 0;
  let hasExpenseLine = false;
  for (const line of lines) {
    if (line.debit < 0 || line.credit < 0) {
      throw new HTTPException(400, {
        message: "Line amounts cannot be negative",
      });
    }
    const debitCents = Math.round(line.debit * 100);
    const creditCents = Math.round(line.credit * 100);
    if (debitCents > MAX_LINE_CENTS || creditCents > MAX_LINE_CENTS) {
      throw new HTTPException(400, {
        message: `Line amounts cannot exceed 9,999,999,999.99`,
      });
    }
    if (debitCents > 0 === creditCents > 0) {
      throw new HTTPException(400, {
        message:
          "Each line must have exactly one positive amount on either debit or credit",
      });
    }
    // Unselected side falls back to the ledger's flagged default pocket
    // (defaultCredit pays, defaultDebit receives).
    let accountId = line.accountId;
    if (!accountId) {
      const fallback = ledgerAccounts.find((a) =>
        hasAccountFlag(
          a.flags,
          creditCents > 0
            ? DEFAULT_CREDIT_ACCOUNT_FLAG
            : DEFAULT_DEBIT_ACCOUNT_FLAG,
        ),
      );
      if (!fallback) {
        throw new HTTPException(400, {
          message: "No default account is configured for this ledger",
        });
      }
      accountId = fallback.id;
    }
    const account = accountsById.get(accountId);
    if (!account) {
      throw new HTTPException(400, {
        message: "All lines must reference accounts from this ledger",
      });
    }
    if (account.status !== "active") {
      throw new HTTPException(400, {
        message: `Account ${account.name ?? account.code} is archived`,
      });
    }
    // Guest entries are expense-only: explicitly chosen accounts must be
    // expense categories, except the flagged default pocket (the payment
    // side always resolves there, and an edit round-trip echoes the
    // resolved id back explicitly). The entry must still touch at least
    // one expense category so a hidden transfer/income post is impossible.
    if (opts.expenseOnly && line.accountId) {
      const isDefaultPocket =
        hasAccountFlag(account.flags, DEFAULT_DEBIT_ACCOUNT_FLAG) ||
        hasAccountFlag(account.flags, DEFAULT_CREDIT_ACCOUNT_FLAG);
      if (account.type !== "expense" && !isDefaultPocket) {
        throw new HTTPException(403, {
          message:
            "Guests can only record expenses: picked accounts must be expense categories",
        });
      }
    }
    if (account.type === "expense") {
      hasExpenseLine = true;
    }
    totalDebitCents += debitCents;
    totalCreditCents += creditCents;
    normalized.push({
      accountId,
      debitCents,
      creditCents,
      memo: line.memo,
    });
  }
  if (opts.expenseOnly && !hasExpenseLine) {
    throw new HTTPException(403, {
      message: "Guests can only record expenses",
    });
  }
  if (totalDebitCents !== totalCreditCents) {
    throw new HTTPException(400, {
      message: "Entry is not balanced: total debits must equal total credits",
    });
  }
  return normalized;
}

/**
 * Only owners see entry creators' and participants' email addresses — same
 * policy as `listMembers`: non-owners must not be able to harvest members'
 * emails through the journal history.
 */
function redactEntryCreatorEmail<
  T extends {
    createdBy?: { email: string | null } | null;
    participants?: Array<{
      ledgerMember: { user: { email: string | null } };
    }>;
  },
>(entry: T, viewerRole: LedgerRole): T {
  if (viewerRole === "owner") return entry;
  return {
    ...entry,
    createdBy: entry.createdBy
      ? { ...entry.createdBy, email: null }
      : entry.createdBy,
    participants: entry.participants?.map((p) => ({
      ...p,
      ledgerMember: {
        ...p.ledgerMember,
        user: { ...p.ledgerMember.user, email: null },
      },
    })),
  };
}

export async function listEntries(
  ledgerId: string,
  opts: { limit?: number; offset?: number } & EntryWindow,
  viewerRole: LedgerRole,
) {
  const [entries, total] = await Promise.all([
    journalRepository.listEntries(ledgerId, opts),
    journalRepository.countEntries(ledgerId, opts),
  ]);
  return {
    entries: entries.map((e) => redactEntryCreatorEmail(e, viewerRole)),
    total,
  };
}

export async function getEntry(
  ledgerId: string,
  entryId: string,
  viewerRole: LedgerRole = "viewer",
  scopeProjectIds?: string[],
) {
  const entry = await journalRepository.findById(entryId);
  if (!entry || entry.ledgerId !== ledgerId) {
    throw new HTTPException(404, { message: "Journal entry not found" });
  }
  // Guests only see entries inside their projects (404 on the rest, no
  // existence leak).
  if (
    scopeProjectIds &&
    (!entry.projectId || !scopeProjectIds.includes(entry.projectId))
  ) {
    throw new HTTPException(404, { message: "Journal entry not found" });
  }
  return redactEntryCreatorEmail(entry, viewerRole);
}

/**
 * Creates a posted journal entry. The ledger row is locked (FOR UPDATE) inside
 * the transaction so the per-ledger entryNo sequence is race-free; lines are
 * validated under the same lock against a transaction-consistent account list,
 * and the archived guard is re-evaluated under the lock (the route's check ran
 * on a pre-transaction snapshot).
 */
export async function createEntry(
  userId: string,
  ledgerId: string,
  data: {
    date: Date;
    memo?: string;
    lines: JournalLineInput[];
    participantMemberIds?: string[];
    projectId?: string | null;
    countsInLedger?: boolean;
    location?: EntryLocationInput | null;
  },
  access: LedgerAccess,
) {
  return prisma.$transaction(async (tx) => {
    await lockLedgerRow(tx, ledgerId);
    const ledger = await ledgerRepository.findById(ledgerId, tx);
    if (!ledger) {
      throw new HTTPException(404, { message: "Ledger not found" });
    }
    assertLedgerWritable(ledger);
    const projectId = await resolveEntryProjectTarget(
      tx,
      userId,
      access,
      data.projectId,
    );
    const [ledgerAccounts, ledgerMembers] = await Promise.all([
      accountRepository.listByLedger(ledgerId, tx),
      ledgerMemberRepository.listByLedger(ledgerId, tx),
    ]);
    const participantMemberIds = await withAutoParticipants(
      tx,
      projectId,
      data.participantMemberIds,
      ledgerMembers,
    );
    return postEntryInTransaction(tx, userId, ledgerId, ledger, {
      ...data,
      projectId,
      participantMemberIds,
      // The owner's keep-in intent — never honored for guests: their posts
      // settle inside the project, so the flag is forced false at posting
      // regardless of what the client asked for.
      countsInLedger:
        access.membership.role === "guest" ? false : data.countsInLedger,
      // System snapshot: true when the creator was a guest. The second,
      // client-immutable dimension of the same ledger-wide exclusion — a
      // later role change never rewrites history.
      guestCreated: access.membership.role === "guest",
      rawLines: data.lines,
      ledgerAccounts,
      ledgerMembers,
      expenseOnly: access.membership.role === "guest",
    });
  });
}

/**
 * Validates and posts an entry inside an existing transaction. Caller must
 * already hold the ledger row lock and have re-checked writability (e.g.
 * `createEntry` above, or `setAccountBalance`) so entryNo stays race-free and
 * line validation runs against a transaction-consistent account list.
 *
 * `participantMemberIds` tags the entry to ledger members (for turnover
 * reports); it must be a subset of `ledgerMembers`, which the caller loads
 * under the same lock so a member removed concurrently is caught here.
 */
export async function postEntryInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  ledgerId: string,
  ledger: { lastEntryNo: number },
  data: {
    date: Date;
    memo?: string;
    rawLines: JournalLineInput[];
    ledgerAccounts: BookAccount[];
    ledgerMembers?: Array<{ id: string }>;
    participantMemberIds?: string[];
    projectId?: string;
    /** Guest mode: lines restricted to expense categories. */
    expenseOnly?: boolean;
    /** Defaults to true when omitted (e.g. system balance adjustments). */
    countsInLedger?: boolean;
    /** System guest rule (see schema): true for guest-created posts. */
    guestCreated?: boolean;
    location?: EntryLocationInput | null;
  },
) {
  const lines = validateJournalLines(data.rawLines, data.ledgerAccounts, {
    expenseOnly: data.expenseOnly,
  });
  const participantMemberIds = validateParticipants(
    data.participantMemberIds,
    data.ledgerMembers ?? [],
  );
  // entryNo comes from the ledger's monotonic counter so numbers are never
  // reused, even after deleting the highest-numbered entry. Race-free
  // because we hold the ledger row lock.
  const entryNo = ledger.lastEntryNo + 1;
  await ledgerRepository.update(ledgerId, { lastEntryNo: entryNo }, tx);
  try {
    return await journalRepository.createEntry(
      {
        ledgerId,
        entryNo,
        date: data.date,
        memo: data.memo,
        createdById: userId,
        projectId: data.projectId,
        countsInLedger: data.countsInLedger ?? true,
        guestCreated: data.guestCreated ?? false,
        ...locationColumns(data.location),
        lines: lines.map((line) => ({
          accountId: line.accountId,
          debit: new Prisma.Decimal(line.debitCents).div(100),
          credit: new Prisma.Decimal(line.creditCents).div(100),
          memo: line.memo,
        })),
        participantMemberIds,
      },
      tx,
    );
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      throw new HTTPException(400, {
        message: "A referenced account no longer exists in this ledger",
      });
    }
    throw err;
  }
}

/**
 * Participants must be current members of this ledger. Deduplicated so a
 * repeated id can't violate the (entryId, ledgerMemberId) unique constraint.
 * Returns undefined (not []) when no participants are given, so
 * system-generated posts (balance adjustments) skip the relation entirely.
 */
function validateParticipants(
  participantMemberIds: string[] | undefined,
  ledgerMembers: Array<{ id: string }>,
): string[] | undefined {
  if (!participantMemberIds?.length) return undefined;
  const memberIds = new Set(ledgerMembers.map((m) => m.id));
  for (const id of new Set(participantMemberIds)) {
    if (!memberIds.has(id)) {
      throw new HTTPException(400, {
        message: "Participants must be members of this ledger",
      });
    }
  }
  return [...new Set(participantMemberIds)];
}

/**
 * Freezes a project entry's split set at write time. An entry posted into a
 * project without explicit participants involves the project's whole current
 * membership, so tag them now: the settlement report splits each entry
 * across its tagged participants, and without this snapshot the legacy
 * fallback (untagged = members at read time) would re-split history whenever
 * membership changes — a member who leaves stops owing their share of an
 * entry they consumed. Project members are keyed by userId while
 * participants are keyed by ledger membership, so the ids resolve through
 * the ledger roster (project members who left the ledger drop out silently;
 * validateParticipants would reject them). Ledger-wide entries keep the
 * optional-participant state — no settlement semantics apply there.
 */
async function withAutoParticipants(
  tx: Prisma.TransactionClient,
  projectId: string | null | undefined,
  participantMemberIds: string[] | undefined,
  ledgerMembers: Array<{ id: string; userId: string }>,
): Promise<string[] | undefined> {
  if (participantMemberIds?.length || !projectId) return participantMemberIds;
  const project = await projectRepository.findByIdWithMembers(projectId, tx);
  if (!project) return participantMemberIds;
  const ledgerMemberIdByUserId = new Map(
    ledgerMembers.map((member) => [member.userId, member.id]),
  );
  return [
    ...new Set(
      project.members
        .map((member) => ledgerMemberIdByUserId.get(member.userId))
        .filter((id): id is string => id !== undefined),
    ),
  ].sort();
}

/**
 * Replaces an entry's date, memo, lines, project, and participants. Mirrors
 * create: the ledger row is locked so line validation runs against a
 * transaction-consistent account list and the archived guard is
 * re-evaluated under the lock. entryNo and the original creator are kept —
 * editing corrects values, it does not re-post the entry. `countsInLedger`
 * keeps-on-omit and stays guest-pinned (see below); the system guest rule
 * (`guestCreated`) is set once at posting and never editable here.
 *
 * Guests may only edit entries they created, and only within (and keeping
 * them in) one of their projects.
 */
export async function updateEntry(
  ledgerId: string,
  entryId: string,
  actor: { userId: string; role: LedgerRole },
  data: {
    date: Date;
    memo?: string;
    lines: JournalLineInput[];
    participantMemberIds?: string[];
    projectId?: string | null;
    countsInLedger?: boolean;
    location?: EntryLocationInput | null;
  },
) {
  return prisma.$transaction(async (tx) => {
    await lockLedgerRow(tx, ledgerId);
    const ledger = await ledgerRepository.findById(ledgerId, tx);
    if (!ledger) {
      throw new HTTPException(404, { message: "Ledger not found" });
    }
    assertLedgerWritable(ledger);
    const entry = await journalRepository.findById(entryId, tx);
    if (!entry || entry.ledgerId !== ledgerId) {
      throw new HTTPException(404, { message: "Journal entry not found" });
    }
    if (actor.role === "guest") {
      if (entry.createdById !== actor.userId) {
        throw new HTTPException(404, { message: "Journal entry not found" });
      }
      // Guests can only edit entries inside their projects; a projectless
      // (legacy) entry has no project scope for them — 404 to match the
      // no-existence-leak policy used elsewhere.
      if (!entry.projectId) {
        throw new HTTPException(404, { message: "Journal entry not found" });
      }
      // A guest-supplied projectId that differs from the entry's project
      // is an attempt to move the entry. Omitting projectId means "no
      // change" and is allowed.
      if (data.projectId && data.projectId !== entry.projectId) {
        throw new HTTPException(403, {
          message: "Guests cannot move an entry out of its project",
        });
      }
    }
    // Full roles may re-assign (or clear) the entry's project; guests keep
    // the entry pinned to the project it lives in (validated above).
    const projectId =
      actor.role === "guest"
        ? entry.projectId
        : await resolveEntryProjectTarget(
            tx,
            actor.userId,
            {
              ledger: {
                id: ledger.id,
                ownerId: ledger.ownerId,
                status: ledger.status,
                name: ledger.name,
              },
              membership: { role: actor.role },
            },
            data.projectId,
          );
    const [ledgerAccounts, ledgerMembers] = await Promise.all([
      accountRepository.listByLedger(ledgerId, tx),
      ledgerMemberRepository.listByLedger(ledgerId, tx),
    ]);
    const lines = validateJournalLines(data.lines, ledgerAccounts, {
      expenseOnly: actor.role === "guest",
    });
    // Replace semantics: omitted participants clear the list, so an edit
    // form fully specifies the entry — and a project entry cleared to none
    // is re-tagged with the project's current members (split-set freeze,
    // mirroring create).
    const participantMemberIds = await withAutoParticipants(
      tx,
      projectId,
      validateParticipants(data.participantMemberIds, ledgerMembers) ?? [],
      ledgerMembers,
    );
    // withAutoParticipants returns undefined for an untagged ledger-wide
    // entry; the repo's delete-and-recreate treats [] as "no tags".
    const participantIds = participantMemberIds ?? [];
    // countsInLedger deviates from replace semantics: omitted = keep the
    // entry's current flag, so editing an excluded entry (repayment)
    // doesn't silently re-include it. Guests can never change it — the
    // creation-time false sticks, mirroring the projectId pinning above;
    // the system guest rule stays in the immutable guestCreated column,
    // which this update never touches.
    const countsInLedger =
      actor.role === "guest"
        ? entry.countsInLedger
        : (data.countsInLedger ?? entry.countsInLedger);
    // Location deviates from replace semantics like countsInLedger: omitted
    // = keep the stored place (edit forms that don't surface the field
    // can't strip it), explicit null = clear, an object = full replacement
    // (parts the client didn't geocode store as null).
    const locationUpdate:
      | {
          address: string | null;
          addressName: string | null;
          latitude: Prisma.Decimal | null;
          longitude: Prisma.Decimal | null;
        }
      | undefined =
      data.location === undefined
        ? undefined
        : {
            address: data.location?.address ?? null,
            addressName: data.location?.addressName ?? null,
            latitude:
              data.location?.latitude !== undefined
                ? new Prisma.Decimal(data.location.latitude.toFixed(6))
                : null,
            longitude:
              data.location?.longitude !== undefined
                ? new Prisma.Decimal(data.location.longitude.toFixed(6))
                : null,
          };
    try {
      return await journalRepository.updateEntry(
        entry.id,
        {
          date: data.date,
          memo: data.memo,
          projectId: projectId ?? null,
          countsInLedger,
          ...(locationUpdate ? { location: locationUpdate } : {}),
          lines: lines.map((line) => ({
            accountId: line.accountId,
            debit: new Prisma.Decimal(line.debitCents).div(100),
            credit: new Prisma.Decimal(line.creditCents).div(100),
            memo: line.memo,
          })),
          participantMemberIds: participantIds,
        },
        tx,
      );
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw new HTTPException(400, {
          message: "A referenced account no longer exists in this ledger",
        });
      }
      throw err;
    }
  });
}

/**
 * Deletes an entry outright (correction via re-posting). Runs under the
 * ledger row lock with the archived guard re-evaluated there, so a ledger
 * archived after the route's check still refuses the delete. Guests may
 * only delete entries they created inside their projects.
 */
export async function deleteEntry(
  ledgerId: string,
  entryId: string,
  actor: { userId: string; role: LedgerRole } = {
    userId: "",
    role: "owner",
  },
) {
  await prisma.$transaction(async (tx) => {
    await lockLedgerRow(tx, ledgerId);
    const ledger = await ledgerRepository.findById(ledgerId, tx);
    if (!ledger) {
      throw new HTTPException(404, { message: "Ledger not found" });
    }
    assertLedgerWritable(ledger);
    const entry = await journalRepository.findById(entryId, tx);
    if (!entry || entry.ledgerId !== ledgerId) {
      throw new HTTPException(404, { message: "Journal entry not found" });
    }
    if (actor.role === "guest" && entry.createdById !== actor.userId) {
      throw new HTTPException(404, { message: "Journal entry not found" });
    }
    await journalRepository.delete(entry.id, tx);
  });
  return { success: true as const };
}
