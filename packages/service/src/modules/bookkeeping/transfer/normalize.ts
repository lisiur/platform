import { ACCOUNT_TYPES, LEDGER_STATUSES } from "../domain";
import {
  BUDGET_KIND_LABELS,
  IMPORTABLE_PREFERENCE_SCOPE,
  instantToDayKey,
  type LedgerExportDocument,
  parseDayKey,
  parseInteger,
  parseText,
} from "./format";
import type { ParsedWorkbook, SheetRow } from "./xlsx";

/**
 * One shape, two sources.
 *
 * A restore reads `data.json`; a spreadsheet import reads the workbook.
 * Everything downstream — resolution, dedupe, writing — works on the shape
 * below and never asks which file it came from, which is what keeps the
 * two paths from drifting into two subtly different importers.
 *
 * The one thing the workbook cannot carry is `key` fidelity: a human-facing
 * sheet has a row key, and for entries that key is the only handle the
 * lines sheet has. Entries whose key column is blank are dropped with a
 * note — creating brand-new rows by typing into a spreadsheet isn't a path
 * this format supports, and pretending otherwise would silently orphan
 * their lines.
 */

export type BudgetKind = "year" | "month" | "category";

export type NormalizedPerson = {
  /** The document's userId, or a stable `name:<name>` stand-in. */
  key: string;
  name: string;
  email: string | null;
};

export type NormalizedAccount = {
  key: string;
  name: string | null;
  code: string | null;
  type: string;
  parentKey: string | null;
  sortOrder: number;
  icon: string | null;
  status: string;
  flags: string[];
  meta: unknown;
  realAccountKey: string | null;
  /** The stable identity two ledgers can be compared on: `code` when
   *  seeded, type+name otherwise. Also the merge dedupe key's account
   *  component. */
  identity: string;
};

export type NormalizedEntryLine = {
  lineNo: number;
  accountKey: string;
  accountIdentity: string;
  debitCents: number;
  creditCents: number;
  memo: string | null;
};

export type NormalizedEntry = {
  key: string;
  dayKey: string;
  date: Date;
  memo: string | null;
  merchant: string | null;
  countsInLedger: boolean;
  excludedFromBudget: boolean;
  projectKey: string | null;
  projectName: string | null;
  paidByKey: string | null;
  participantKeys: string[];
  location: {
    address: string | null;
    addressName: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
  lines: NormalizedEntryLine[];
  photoFiles: string[];
};

export type NormalizedProject = {
  key: string;
  name: string;
  description: string | null;
  status: string;
  startDate: Date | null;
  endDate: Date | null;
  memberKeys: string[];
};

export type NormalizedImport = {
  formatVersion: number;
  ledgerName: string | null;
  ledgerDescription: string | null;
  currency: string;
  timezoneOffsetMinutes: number;
  accounts: NormalizedAccount[];
  entries: NormalizedEntry[];
  projects: NormalizedProject[];
  people: NormalizedPerson[];
  budgets: Array<{
    kind: BudgetKind;
    year: number;
    month: number | null;
    accountKey: string | null;
    cents: number;
  }>;
  budgetExcludedAccountKeys: string[];
  realAccounts: Array<{
    key: string;
    name: string;
    type: string;
    icon: string | null;
    meta: unknown;
  }>;
  preferences: Array<{ key: string; value: unknown }>;
  /** Rows the source couldn't express; surfaced in the preview report. */
  notes: string[];
};

export async function normalizeUpload(input: {
  kind: "archive" | "workbook" | "document";
  document: LedgerExportDocument | null;
  workbook: ParsedWorkbook | null;
}): Promise<NormalizedImport> {
  return input.document
    ? fromDocument(input.document)
    : fromWorkbook(input.workbook);
}

function accountIdentity(input: {
  code: string | null;
  type: string;
  name: string | null;
}): string {
  return input.code
    ? `code:${input.code}`
    : `name:${input.type}:${input.name ?? ""}`;
}

// ---------------------------------------------------------------------------
// data.json
// ---------------------------------------------------------------------------

function fromDocument(document: LedgerExportDocument): NormalizedImport {
  const notes: string[] = [];
  const accountIdentityByKey = new Map(
    document.accounts.map((account) => [account.key, accountIdentity(account)]),
  );
  const projectNameByKey = new Map(
    document.projects.map((project) => [project.key, project.name]),
  );
  const people = new Map<string, NormalizedPerson>();
  for (const member of document.members) {
    people.set(member.key, {
      key: member.key,
      name: member.name,
      email: member.email,
    });
  }

  const entries: NormalizedEntry[] = [];
  for (const entry of document.entries) {
    for (const participant of entry.participants) {
      if (!people.has(participant.key)) {
        people.set(participant.key, {
          key: participant.key,
          name: participant.name,
          email: participant.email,
        });
      }
    }
    if (entry.paidByKey && !people.has(entry.paidByKey)) {
      // A payer who has since left the ledger isn't in `members`, but the
      // tag still has to resolve to somebody or the entry silently
      // re-attributes itself to the importer.
      people.set(entry.paidByKey, {
        key: entry.paidByKey,
        name: memberNameFor(document, entry.paidByKey),
        email: null,
      });
    }
    entries.push({
      key: entry.key,
      dayKey: instantToDayKey(
        new Date(entry.date),
        document.timezoneOffsetMinutes,
      ),
      date: new Date(entry.date),
      memo: entry.memo,
      merchant: entry.merchant,
      countsInLedger: entry.countsInLedger,
      excludedFromBudget: entry.excludedFromBudget,
      projectKey: entry.projectKey,
      projectName: entry.projectKey
        ? (projectNameByKey.get(entry.projectKey) ?? null)
        : null,
      paidByKey: entry.paidByKey,
      participantKeys: entry.participants.map((participant) => participant.key),
      location: entry.location,
      lines: entry.lines.map((line, index) => ({
        lineNo: index + 1,
        accountKey: line.accountKey,
        accountIdentity:
          accountIdentityByKey.get(line.accountKey) ?? line.accountKey,
        debitCents: line.debitCents,
        creditCents: line.creditCents,
        memo: line.memo,
      })),
      photoFiles: entry.attachments.map((attachment) => attachment.file),
    });
  }

  return {
    formatVersion: document.formatVersion,
    ledgerName: document.ledger.name,
    ledgerDescription: document.ledger.description,
    currency: document.ledger.currency,
    timezoneOffsetMinutes: document.timezoneOffsetMinutes,
    accounts: document.accounts.map((account) => ({
      key: account.key,
      name: account.name,
      code: account.code,
      type: account.type,
      parentKey: account.parentKey,
      sortOrder: account.sortOrder,
      icon: account.icon,
      status: LEDGER_STATUSES.includes(account.status as never)
        ? account.status
        : "active",
      flags: account.flags,
      meta: account.meta,
      realAccountKey: account.realAccountKey,
      identity: accountIdentity(account),
    })),
    entries,
    projects: document.projects.map((project) => ({
      key: project.key,
      name: project.name,
      description: project.description,
      status: project.status,
      startDate: project.startDate ? new Date(project.startDate) : null,
      endDate: project.endDate ? new Date(project.endDate) : null,
      memberKeys: project.memberKeys,
    })),
    people: [...people.values()],
    budgets: document.budgets,
    budgetExcludedAccountKeys: document.budgetExcludedAccountKeys ?? [],
    realAccounts: document.realAccounts.map((account) => ({
      key: account.key,
      name: account.name,
      type: account.type,
      icon: account.icon,
      meta: account.meta,
    })),
    preferences: document.preferences
      .filter((preference) => preference.scope === IMPORTABLE_PREFERENCE_SCOPE)
      .map((preference) => ({ key: preference.key, value: preference.value })),
    notes,
  };
}

function memberNameFor(document: LedgerExportDocument, userId: string): string {
  return (
    document.members.find((member) => member.key === userId)?.name ?? "未知成员"
  );
}

// ---------------------------------------------------------------------------
// 账本.xlsx
// ---------------------------------------------------------------------------

function fromWorkbook(workbook: ParsedWorkbook | null): NormalizedImport {
  if (!workbook) {
    throw new Error("normalizeUpload: neither a document nor a workbook");
  }
  const notes: string[] = [];
  const rows = workbook.rows;
  const offset = workbook.timezoneOffsetMinutes;
  const ledgerRow = rows.ledger[0] ?? {};

  // Accounts first: the lines and budget rows reference them by key, and
  // the identity table is what the merge dedupe compares.
  const accounts: NormalizedAccount[] = rows.accounts.map((row, index) => {
    const type = text(row.type) ?? "expense";
    const code = text(row.code);
    const name = text(row.name);
    return {
      key: text(row.key) ?? `new-account-${index}`,
      name,
      code,
      type: ACCOUNT_TYPES.includes(type as never) ? type : "expense",
      parentKey: text(row.parentKey),
      sortOrder: int(row.sortOrder) ?? 0,
      icon: text(row.icon),
      status: "active",
      flags: list(row.flags),
      meta: row.meta ?? null,
      realAccountKey: text(row.realAccountKey),
      identity: accountIdentity({ code, type, name }),
    };
  });
  const accountIdentityByKey = new Map(
    accounts.map((account) => [account.key, account.identity]),
  );

  // People are named, not keyed, in a spreadsheet: 参与人 reads
  // "Alice<alice@example.com>" or "Alice". The name doubles as the key so
  // the resolution pass sees exactly what it sees on the restore path.
  const people = new Map<string, NormalizedPerson>();
  const notePerson = (label: string) => {
    const { name, email } = parsePersonLabel(label);
    if (!name) return null;
    const key = email ? `email:${email.toLowerCase()}` : `name:${name}`;
    people.set(key, { key, name, email });
    return key;
  };
  for (const row of rows.members) {
    const name = text(row.name);
    if (!name) continue;
    const email = text(row.email);
    const key = email ? `email:${email.toLowerCase()}` : `name:${name}`;
    people.set(key, { key, name, email });
  }

  const projectNameByKey = new Map<string, string>();
  const projects: NormalizedProject[] = rows.projects
    .filter((row) => Boolean(text(row.name)))
    .map((row, index) => {
      const key = text(row.key) ?? `new-project-${index}`;
      const name = text(row.name) as string;
      projectNameByKey.set(key, name);
      return {
        key,
        name,
        description: text(row.description),
        status: text(row.status) ?? "active",
        startDate: parseDayKey(row.startDate, offset),
        endDate: parseDayKey(row.endDate, offset),
        memberKeys: list(row.members)
          .map((label) => notePerson(label))
          .filter((value): value is string => value !== null),
      };
    });

  const entryKeyByRow = new Map<SheetRow, string>();
  const entries: NormalizedEntry[] = [];
  rows.entries.forEach((row, index) => {
    const key = text(row.key);
    if (!key) {
      notes.push(
        `流水第 ${index + 2} 行没有键，已跳过（表格导入不支持新增空白行）`,
      );
      return;
    }
    entryKeyByRow.set(row, key);
    const date = parseDayKey(row.day, offset);
    if (!date) {
      notes.push(`流水第 ${index + 2} 行的日期无法识别，已跳过`);
      return;
    }
    const participants = list(row.participants)
      .map((label) => notePerson(label))
      .filter((value): value is string => value !== null);
    const payer = text(row.paidBy);
    entries.push({
      key,
      dayKey: instantToDayKey(date, offset),
      date,
      memo: text(row.memo),
      merchant: text(row.merchant),
      countsInLedger:
        row.countsInLedger === null ? true : row.countsInLedger === true,
      excludedFromBudget: row.excludedFromBudget === true,
      projectKey: text(row.projectKey),
      projectName: projectNameByKey.get(text(row.projectKey) ?? "") ?? null,
      paidByKey: payer ? (notePerson(payer) ?? null) : null,
      participantKeys: participants,
      location: {
        address: text(row.address),
        addressName: text(row.addressName),
        latitude: numberOrNull(row.latitude),
        longitude: numberOrNull(row.longitude),
      },
      lines: [],
      // Photos only ever travel in the archive; a bare spreadsheet has no
      // bytes to attach, and the 附件文件 column is informational here.
      photoFiles: [],
    });
  });

  const linesByEntry = new Map<string, NormalizedEntryLine[]>();
  rows.entryLines.forEach((row) => {
    const entryKey = text(row.entryKey);
    if (!entryKey) {
      notes.push("有一条流水分录没有指定流水键，已跳过");
      return;
    }
    const lines = linesByEntry.get(entryKey) ?? [];
    const debitCents = int(row.debitCents) ?? 0;
    const creditCents = int(row.creditCents) ?? 0;
    const accountKey = text(row.accountKey) ?? "";
    lines.push({
      lineNo: lines.length + 1,
      accountKey,
      accountIdentity: accountIdentityByKey.get(accountKey) ?? accountKey,
      debitCents,
      creditCents,
      memo: text(row.memo),
    });
    linesByEntry.set(entryKey, lines);
  });
  for (const entry of entries) {
    entry.lines = linesByEntry.get(entry.key) ?? [];
  }

  const budgetKindByLabel = new Map<string, BudgetKind>(
    Object.entries(BUDGET_KIND_LABELS) as [string, BudgetKind][],
  );

  return {
    formatVersion: 1,
    ledgerName: text(ledgerRow.name),
    ledgerDescription: text(ledgerRow.description),
    currency: text(ledgerRow.currency) ?? "CNY",
    timezoneOffsetMinutes: offset,
    accounts,
    entries,
    projects,
    people: [...people.values()],
    budgets: rows.budgets
      .map((row) => ({
        kind: budgetKindByLabel.get(text(row.kind) ?? ""),
        year: int(row.year),
        month: int(row.month),
        accountKey: text(row.accountKey),
        cents: int(row.cents) ?? 0,
      }))
      .filter(
        (
          budget,
        ): budget is {
          kind: BudgetKind;
          year: number;
          month: number | null;
          accountKey: string | null;
          cents: number;
        } => budget.kind !== undefined && budget.year !== null,
      ),
    budgetExcludedAccountKeys: list(ledgerRow.budgetExcludedAccountKeys),
    realAccounts: rows.realAccounts
      .filter((row) => Boolean(text(row.name)))
      .map((row, index) => ({
        key: text(row.key) ?? `new-real-account-${index}`,
        name: text(row.name) as string,
        type: text(row.type) ?? "asset",
        icon: text(row.icon),
        meta: row.meta ?? null,
      })),
    preferences: rows.preferences
      .filter((row) => text(row.scope) === IMPORTABLE_PREFERENCE_SCOPE)
      .map((row) => ({ key: text(row.key) ?? "", value: row.value })),
    notes,
  };
}

function parsePersonLabel(label: string): {
  name: string;
  email: string | null;
} {
  const match = /^(.*)<([^>]+)>$/.exec(label.trim());
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { name: label.trim(), email: null };
}

function text(value: unknown): string | null {
  return parseText(value);
}

function int(value: unknown): number | null {
  return parseInteger(value);
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
