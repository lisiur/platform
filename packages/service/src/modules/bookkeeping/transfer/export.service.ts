import { isVirtualUser } from "@repo/shared";
import {
  JOURNAL_ENTRY_BIZ_TYPE,
  listBizAttachments,
  photoExtension,
} from "#modules/attachment/attachment.service";
import type { LedgerAccess } from "../access";
import { accountRepository } from "../account.repository";
import { budgetRepository } from "../budget.repository";
import { categoryBudgetRepository } from "../category-budget.repository";
import { classifyEntryKind } from "../domain";
import { journalRepository } from "../journal.repository";
import { ledgerRepository } from "../ledger.repository";
import { ledgerMemberRepository } from "../ledger-member.repository";
import { preferenceRepository } from "../preference.repository";
import { projectRepository } from "../project.repository";
import { realAccountRepository } from "../real-account.repository";
import {
  IMPORTABLE_PREFERENCE_SCOPE,
  instantToDayKey,
  LEDGER_EXPORT_FORMAT_VERSION,
  type LedgerExportDocument,
  type LedgerExportEntry,
  photoFileName,
} from "./format";
import type { WorkbookRows } from "./xlsx";
import { PHOTO_PREFIX } from "./zip";

/** Entries are pulled in pages rather than in one query: the document
 *  holds every line of every entry, and a single unbounded findMany on a
 *  decade-old ledger is the shape that takes the API box down. */
const EXPORT_PAGE_SIZE = 500;

/** Everything an export needs, assembled once: the lossless document, the
 *  workbook rows derived from it, and the photos as paths to stream (their
 *  bytes never enter memory — the archive writer reads them off disk). */
export type LedgerExport = {
  document: LedgerExportDocument;
  rows: WorkbookRows;
  photoFiles: Array<{ entryName: string; path: string }>;
  /** The photos' total size, measured whether or not they're included —
   *  the route's size check reads this, so an xlsx-only export of a ledger
   *  too big to archive still gets told the honest reason. */
  photoBytes: number;
  entryCount: number;
  photoCount: number;
};

export type ExportOptions = {
  tzOffsetMinutes: number;
  from?: Date;
  to?: Date;
  includePhotos: boolean;
};

/**
 * Snapshots one ledger into a portable document. Owners and editors only —
 * a guest's ledger slice is a projection rather than the ledger, and
 * handing out a whole-ledger backup is an editor-level act (the guard is
 * the route's `requireLedgerAccess(..., "editor")`).
 *
 * The member/participant redaction is the roster's own rule: emails are the
 * owner's to see. An editor's file therefore carries participants by name
 * alone, which is what `import.service`'s people resolution has to work
 * with when that file is restored into another account.
 */
export async function buildLedgerExport(
  userId: string,
  access: LedgerAccess,
  opts: ExportOptions,
): Promise<LedgerExport> {
  const ledgerId = access.ledger.id;
  const showEmail = access.membership.role === "owner";

  const ledger = await ledgerRepository.findById(ledgerId);
  if (!ledger) {
    throw new Error(`export: ledger ${ledgerId} vanished under the guard`);
  }

  const [
    accounts,
    projects,
    members,
    budgetYears,
    categoryBudgets,
    preferences,
  ] = await Promise.all([
    accountRepository.listByLedger(ledgerId),
    projectRepository.listByLedger(ledgerId),
    ledgerMemberRepository.listByLedger(ledgerId),
    budgetRepository.listAll(ledgerId),
    categoryBudgetRepository.listAll(ledgerId),
    preferenceRepository.listForUser(userId),
  ]);

  const { entries, photoFiles, photoBytes } = await readEntries(
    ledgerId,
    opts,
    showEmail,
  );

  const realAccounts = await realAccountRepository.listByIds([
    ...new Set(
      accounts
        .map((account) => account.realAccountId)
        .filter((id): id is string => typeof id === "string"),
    ),
  ]);

  const document: LedgerExportDocument = {
    formatVersion: LEDGER_EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    timezoneOffsetMinutes: opts.tzOffsetMinutes,
    ledger: {
      key: ledger.id,
      name: ledger.name,
      description: ledger.description,
      currency: ledger.currency,
      status: ledger.status,
      isDefault: ledger.isDefault,
      createdAt: ledger.createdAt.toISOString(),
    },
    budgetExcludedAccountKeys: ledger.budgetExcludedAccountIds,
    accounts: accounts.map((account) => ({
      key: account.id,
      name: account.name,
      code: account.code,
      type: account.type,
      parentKey: account.parentId,
      sortOrder: account.sortOrder,
      icon: account.icon,
      status: account.status,
      flags: account.flags,
      meta: account.meta,
      realAccountKey: account.realAccountId,
    })),
    entries,
    projects: projects.map((project) => ({
      key: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      startDate: project.startDate?.toISOString() ?? null,
      endDate: project.endDate?.toISOString() ?? null,
      memberKeys: project.members.map((member) => member.userId),
    })),
    members: members.map((member) => ({
      key: member.userId,
      name: member.user.name,
      email: showEmail ? member.user.email : null,
      role: member.role,
      isVirtual: isVirtualUser(member.user.flags),
      createdAt: member.createdAt.toISOString(),
    })),
    budgets: [
      ...budgetYears.map((year) => ({
        kind: "year" as const,
        year: year.year,
        month: null,
        accountKey: null,
        cents: year.cents,
      })),
      ...budgetYears.flatMap((year) =>
        year.months.map((override) => ({
          kind: "month" as const,
          year: year.year,
          month: override.month,
          accountKey: null,
          cents: override.cents,
        })),
      ),
      ...categoryBudgets.map((budget) => ({
        kind: "category" as const,
        year: budget.year,
        month: null,
        accountKey: budget.accountId,
        cents: budget.cents,
      })),
    ],
    realAccounts: realAccounts.map((account) => ({
      key: account.id,
      name: account.name,
      type: account.type,
      status: account.status,
      icon: account.icon,
      meta: account.meta,
    })),
    preferences: preferences
      .filter(
        (row) =>
          row.scopeType === IMPORTABLE_PREFERENCE_SCOPE &&
          row.scopeId === ledgerId,
      )
      .flatMap((row) => {
        const data = (row.data ?? {}) as Record<string, unknown>;
        return Object.entries(data).map(([key, value]) => ({
          scope: row.scopeType,
          scopeKey: row.scopeId,
          key,
          value,
        }));
      }),
  };

  return {
    document,
    rows: rowsFromDocument(document),
    photoFiles: opts.includePhotos ? photoFiles : [],
    photoBytes,
    entryCount: entries.length,
    photoCount: opts.includePhotos ? photoFiles.length : 0,
  };
}

async function readEntries(
  ledgerId: string,
  opts: ExportOptions,
  showEmail: boolean,
): Promise<{
  entries: LedgerExportEntry[];
  photoFiles: Array<{ entryName: string; path: string }>;
  photoBytes: number;
}> {
  const entries: LedgerExportEntry[] = [];
  const photoFiles: Array<{ entryName: string; path: string }> = [];
  let photoBytes = 0;
  let offset = 0;

  for (;;) {
    // Both inclusion toggles are ON: an export is the ledger's whole
    // history, including the entries a creator opted out of the journal
    // surfaces and the budget-excluded ones. Dropping them would make a
    // restore quietly lose money.
    const page = await journalRepository.listEntries(ledgerId, {
      limit: EXPORT_PAGE_SIZE,
      offset,
      sort: "date",
      order: "asc",
      ...(opts.from ? { from: opts.from } : {}),
      ...(opts.to ? { to: opts.to } : {}),
      includeExcluded: true,
      includeBudgetExcluded: true,
    });
    if (page.length === 0) break;

    const attachments = await listBizAttachments({
      bizType: JOURNAL_ENTRY_BIZ_TYPE,
      bizIds: page.map((entry) => entry.id),
    });
    const byEntry = new Map<string, typeof attachments>();
    for (const attachment of attachments) {
      const list = byEntry.get(attachment.bizId) ?? [];
      list.push(attachment);
      byEntry.set(attachment.bizId, list);
    }

    for (const entry of page) {
      const claimed = byEntry.get(entry.id) ?? [];
      entries.push({
        key: entry.id,
        entryNo: entry.entryNo,
        date: entry.date.toISOString(),
        memo: entry.memo,
        merchant: entry.merchant,
        status: entry.status,
        countsInLedger: entry.countsInLedger,
        excludedFromBudget: entry.excludedFromBudget,
        guestCreated: entry.guestCreated,
        projectKey: entry.projectId,
        paidByKey: entry.paidById,
        createdByKey: entry.createdById,
        createdAt: entry.createdAt.toISOString(),
        location:
          entry.address == null &&
          entry.addressName == null &&
          entry.latitude == null &&
          entry.longitude == null
            ? null
            : {
                address: entry.address,
                addressName: entry.addressName,
                latitude:
                  entry.latitude == null ? null : Number(entry.latitude),
                longitude:
                  entry.longitude == null ? null : Number(entry.longitude),
              },
        participants: entry.participants.map((participant) => ({
          key: participant.userId,
          name: participant.user.name,
          // The roster's own rule, applied here because this reads the
          // repository directly and so never passes through the journal
          // service's `redactEntryCreatorEmail`.
          email: showEmail ? participant.user.email : null,
        })),
        lines: entry.lines.map((line) => ({
          accountKey: line.accountId,
          debitCents: Math.round(Number(line.debit) * 100),
          creditCents: Math.round(Number(line.credit) * 100),
          memo: line.memo,
        })),
        attachments: claimed.map((attachment, index) => ({
          file: photoFileName(
            entry.entryNo,
            index + 1,
            photoExtension(attachment.upload.mimeType),
          ),
          mimeType: attachment.upload.mimeType,
          size: attachment.upload.size,
          hash: attachment.upload.hash,
        })),
      });

      for (const attachment of claimed) photoBytes += attachment.upload.size;
      if (opts.includePhotos) {
        for (const [index, attachment] of claimed.entries()) {
          photoFiles.push({
            entryName: `${PHOTO_PREFIX}${photoFileName(
              entry.entryNo,
              index + 1,
              photoExtension(attachment.upload.mimeType),
            )}`,
            path: attachment.upload.path,
          });
        }
      }
    }

    if (page.length < EXPORT_PAGE_SIZE) break;
    offset += page.length;
  }

  return { entries, photoFiles, photoBytes };
}

/**
 * The workbook's view of the document. Pure and total: every value is
 * already in the shape `SHEET_COLUMNS` declares, so `buildWorkbook` only
 * encodes. Amounts become yuan, instants become local days — everything
 * needed to reverse either lives in the document itself.
 */
export function rowsFromDocument(document: LedgerExportDocument): WorkbookRows {
  const memberNameById = new Map(
    document.members.map((member) => [member.key, member.name]),
  );
  const accountTypeByKey = new Map(
    document.accounts.map((account) => [account.key, account.type]),
  );

  return {
    ledger: [
      {
        key: document.ledger.key,
        name: document.ledger.name,
        description: document.ledger.description,
        currency: document.ledger.currency,
        status: document.ledger.status,
        isDefault: document.ledger.isDefault,
        timezoneOffsetMinutes: document.timezoneOffsetMinutes,
        budgetExcludedAccountKeys: document.budgetExcludedAccountKeys,
        exportedAt: document.exportedAt,
        entryCount: document.entries.length,
        photoCount: document.entries.reduce(
          (sum, entry) => sum + entry.attachments.length,
          0,
        ),
      },
    ],
    accounts: document.accounts.map((account) => ({
      key: account.key,
      name: account.name,
      code: account.code,
      type: account.type,
      parentKey: account.parentKey,
      sortOrder: account.sortOrder,
      icon: account.icon,
      status: account.status,
      realAccountKey: account.realAccountKey,
      flags: account.flags,
      meta: account.meta,
    })),
    entries: document.entries.map((entry) => ({
      key: entry.key,
      entryNo: entry.entryNo,
      day: instantToDayKey(
        new Date(entry.date),
        document.timezoneOffsetMinutes,
      ),
      kind: classifyEntryKind(
        entry.lines.map((line) => ({
          account: { type: accountTypeByKey.get(line.accountKey) ?? "expense" },
        })),
      ),
      amountCents: entry.lines.reduce((sum, line) => sum + line.debitCents, 0),
      memo: entry.memo,
      merchant: entry.merchant,
      projectKey: entry.projectKey,
      paidBy: entry.paidByKey
        ? (memberNameById.get(entry.paidByKey) ?? null)
        : null,
      participants: entry.participants.map((participant) =>
        participant.email
          ? `${participant.name}<${participant.email}>`
          : participant.name,
      ),
      address: entry.location?.address ?? null,
      addressName: entry.location?.addressName ?? null,
      latitude: entry.location?.latitude ?? null,
      longitude: entry.location?.longitude ?? null,
      countsInLedger: entry.countsInLedger,
      excludedFromBudget: entry.excludedFromBudget,
      guestCreated: entry.guestCreated,
      status: entry.status,
      createdBy: entry.createdByKey
        ? (memberNameById.get(entry.createdByKey) ?? null)
        : null,
      createdAt: entry.createdAt,
      attachmentCount: entry.attachments.length,
      attachmentFiles: entry.attachments.map((attachment) => attachment.file),
    })),
    entryLines: document.entries.flatMap((entry) =>
      entry.lines.map((line, index) => ({
        entryKey: entry.key,
        lineNo: index + 1,
        accountKey: line.accountKey,
        debitCents: line.debitCents,
        creditCents: line.creditCents,
        memo: line.memo,
      })),
    ),
    projects: document.projects.map((project) => ({
      key: project.key,
      name: project.name,
      description: project.description,
      status: project.status,
      startDate: project.startDate
        ? instantToDayKey(
            new Date(project.startDate),
            document.timezoneOffsetMinutes,
          )
        : null,
      endDate: project.endDate
        ? instantToDayKey(
            new Date(project.endDate),
            document.timezoneOffsetMinutes,
          )
        : null,
      members: project.memberKeys.map((key) => memberNameById.get(key) ?? key),
    })),
    members: document.members.map((member) => ({
      key: member.key,
      name: member.name,
      email: member.email,
      role: member.role,
      isVirtual: member.isVirtual,
      createdAt: member.createdAt,
    })),
    budgets: document.budgets.map((budget) => ({
      kind: budget.kind,
      year: budget.year,
      month: budget.month,
      accountKey: budget.accountKey,
      cents: budget.cents,
    })),
    realAccounts: document.realAccounts.map((account) => ({
      key: account.key,
      name: account.name,
      type: account.type,
      status: account.status,
      icon: account.icon,
      meta: account.meta,
    })),
    preferences: document.preferences.map((preference) => ({
      scope: preference.scope,
      scopeKey: preference.scopeKey,
      key: preference.key,
      value: preference.value,
    })),
  };
}
