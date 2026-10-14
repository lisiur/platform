import { createHash } from "node:crypto";
import { VIRTUAL_USER_FLAG } from "@repo/shared";
import { HTTPException } from "hono/http-exception";
import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";
import {
  createAttachment,
  JOURNAL_ENTRY_BIZ_TYPE,
  PHOTO_MEDIA_TYPES,
} from "#modules/attachment/attachment.service";
import { assertLedgerWritable, requireLedgerAccess } from "../access";
import { accountRepository } from "../account.repository";
import { budgetRepository } from "../budget.repository";
import { categoryBudgetRepository } from "../category-budget.repository";
import {
  claimEntryAttachments,
  type JournalLineInput,
  postEntryInTransaction,
} from "../journal.service";
import { ledgerRepository, lockLedgerRow } from "../ledger.repository";
import { ledgerMemberRepository } from "../ledger-member.repository";
import { preferenceRepository } from "../preference.repository";
import { projectRepository } from "../project.repository";
import { projectMemberRepository } from "../project-member.repository";
import { realAccountRepository } from "../real-account.repository";
import { instantToDayKey, MAX_IMPORT_VIRTUAL_MEMBERS } from "./format";
import {
  type NormalizedEntry,
  type NormalizedImport,
  normalizeUpload,
} from "./normalize";
import { readWorkbook, type SheetIssue } from "./xlsx";
import type { UploadPayload } from "./zip";

/**
 * Importing a ledger file into an account.
 *
 * Two modes, one pipeline. `new` (restore) creates a ledger and replays
 * everything into it; `merge` resolves the file's accounts, projects and
 * people against a ledger that already exists and skips entries already
 * there. Both run the same `prepareImport` first, so the preview reports
 * exactly what the commit does — the commit re-derives the plan from the
 * same bytes instead of trusting a stored one.
 *
 * Ids never carry across. Entry numbers come off the target ledger's
 * counter, account and project keys resolve to whatever the target has,
 * and people resolve by email, then by name, then to a virtual member.
 * That resolution is what makes a restore into another account possible at
 * all, and it is also where the export's email redaction starts to cost:
 * an editor's file has names only, so its people come back as placeholders.
 */

/** Entries per transaction. The ledger row lock is held for a whole chunk
 *  (entry numbers come off its counter), so one transaction across 20k
 *  entries would block every other writer on that ledger for minutes. */
const IMPORT_CHUNK_SIZE = 200;

/** How many of a merge target's existing entries to fingerprint per page. */
const FINGERPRINT_PAGE_SIZE = 1000;

export const MAX_IMPORT_ENTRIES = 20_000;

export type ImportTarget =
  | { mode: "new"; ledgerName?: string }
  | { mode: "merge"; ledgerId: string };

export type ResolvedAccount = {
  key: string;
  label: string;
  action: "reuse" | "create";
  targetId?: string;
};

export type ResolvedProject = {
  key: string;
  name: string;
  action: "reuse" | "create";
  targetId?: string;
};

export type ResolvedPerson = {
  key: string;
  name: string;
  email: string | null;
  /** `drop` = over the per-ledger virtual-member cap, so the tag goes away
   *  rather than the import inventing more people than the product allows. */
  action: "reuse" | "create" | "drop";
  targetId?: string;
};

export type ImportIssue = {
  /** Spreadsheet row, or `entry:<key>` / `line:<entryKey>#<n>` — a
   *  spreadsheet-only import has no row numbers, and a restore that
   *  reports nothing is a restore nobody can debug. */
  where: string;
  message: string;
};

/** Ids resolved by the write phase, threaded from the setup transaction
 *  into the entry chunks. */
type WriteContext = {
  accountIdByKey: Map<string, string>;
  projectIdByKey: Map<string, string>;
  userIdByPersonKey: Map<string, string>;
};

export type ImportPlan = {
  source: UploadPayload["kind"];
  document: NormalizedImport;
  /** The entries review let through, in file order. NOT part of the
   *  preview response — it exists so the commit posts exactly what the
   *  preview counted, instead of re-deciding per entry and drifting from
   *  the numbers the user just approved. */
  entriesToPost: NormalizedEntry[];
  accounts: ResolvedAccount[];
  projects: ResolvedProject[];
  people: ResolvedPerson[];
  entries: {
    total: number;
    importable: number;
    duplicates: number;
    invalid: number;
  };
  photos: { count: number; bytes: number; missing: string[] };
  issues: ImportIssue[];
  blocking: string[];
};

export type ImportResult = {
  ledgerId: string;
  mode: ImportTarget["mode"];
  created: {
    accounts: number;
    projects: number;
    people: number;
    entries: number;
    photos: number;
  };
  skipped: { entries: number };
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Preview + commit
// ---------------------------------------------------------------------------

/**
 * The binding between what the user approved and what gets committed.
 *
 * Deliberately not a capability: it grants nothing. The commit re-runs the
 * same guards and re-derives the same plan; this hash only refuses a file
 * that isn't byte-identical to the previewed one, so an approval can't be
 * pointed at a different ledger's data afterwards.
 */
export function previewToken(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function previewImport(
  userId: string,
  payload: UploadPayload,
  target: ImportTarget,
): Promise<ImportPlan> {
  return prepareImport(userId, payload, target);
}

export async function commitImport(
  userId: string,
  payload: UploadPayload,
  target: ImportTarget,
): Promise<ImportResult> {
  const plan = await prepareImport(userId, payload, target);
  if (plan.blocking.length > 0) {
    throw new HTTPException(400, {
      message: `文件无法导入：${plan.blocking.join("；")}`,
    });
  }

  // A restore creates its ledger INSIDE the write phase's setup
  // transaction. Creating it out here first would leave an empty ledger
  // behind whenever the setup failed — and the retry would then land on
  // "name (2)" instead of the name the user chose.
  let ledgerId = target.mode === "merge" ? target.ledgerId : "";
  const created = await writeImport(
    userId,
    target,
    plan,
    payload,
    async (tx) => {
      ledgerId = await createTargetLedger(userId, target, plan.document, tx);
      return ledgerId;
    },
  );

  return {
    ledgerId,
    mode: target.mode,
    created,
    skipped: { entries: plan.entries.duplicates },
    warnings: [
      ...plan.document.notes,
      ...plan.issues.map((issue) => `${issue.where}：${issue.message}`),
      ...(plan.people.some((person) => person.action === "drop")
        ? [
            `有 ${plan.people.filter((person) => person.action === "drop").length} 位成员超过每个账本 ${MAX_IMPORT_VIRTUAL_MEMBERS} 位虚拟成员的上限，这些流水不再标记参与人`,
          ]
        : []),
    ],
  };
}

/** Ledger name for a restore: the file's own, numbered when a ledger of
 *  that name already exists so a second restore never collides with the
 *  first. Runs in the caller's transaction — see `commitImport`. */
async function createTargetLedger(
  userId: string,
  target: ImportTarget,
  document: NormalizedImport,
  tx: Prisma.TransactionClient,
): Promise<string> {
  const base =
    (target.mode === "new" ? target.ledgerName : undefined)?.trim() ||
    document.ledgerName ||
    "导入的账本";
  const existing = await ledgerRepository.listForUser(userId, tx);
  const taken = new Set(existing.map((ledger) => ledger.name));
  let name = base;
  for (let suffix = 2; taken.has(name); suffix++) name = `${base} (${suffix})`;

  const ledger = await ledgerRepository.create(
    {
      ownerId: userId,
      name,
      description: document.ledgerDescription ?? undefined,
      currency: document.currency || undefined,
    },
    tx,
  );
  await ledgerMemberRepository.create(
    { ledgerId: ledger.id, userId, role: "owner" },
    tx,
  );
  return ledger.id;
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

async function prepareImport(
  userId: string,
  payload: UploadPayload,
  target: ImportTarget,
): Promise<ImportPlan> {
  const issues: ImportIssue[] = [];
  const blocking: string[] = [];

  const { document, sheetIssues } = await readSource(payload);
  for (const issue of sheetIssues) {
    issues.push({
      where: `${issue.sheet} 第 ${issue.row} 行`,
      message: `「${issue.header}」${issue.message}`,
    });
  }

  if (document.entries.length > MAX_IMPORT_ENTRIES) {
    blocking.push(
      `流水条数 ${document.entries.length} 超过 ${MAX_IMPORT_ENTRIES} 上限`,
    );
  }
  for (const account of document.accounts) {
    if (!account.name && !account.code) {
      blocking.push("账户表中存在既没有名称也没有内置编码的账户，无法导入");
      break;
    }
  }

  // A merge target is guarded exactly as a live write is; a fresh ledger
  // has nothing to resolve against yet.
  const targetContext =
    target.mode === "merge"
      ? await resolveTargetLedger(userId, target.ledgerId)
      : null;

  const accounts = resolveAccounts(document, targetContext);
  const projects = resolveProjects(document, targetContext);
  const people = await resolvePeople(userId, document, targetContext);

  const existingFingerprints =
    targetContext === null
      ? new Set<string>()
      : await existingEntryFingerprints(
          targetContext,
          document.timezoneOffsetMinutes,
        );

  const photos = collectPhotos(document, payload);
  const review = reviewEntries(
    document,
    accounts,
    projects,
    existingFingerprints,
    new Set(photos.missing),
    issues,
  );

  return {
    source: payload.kind,
    document,
    entriesToPost: review.toPost,
    accounts,
    projects,
    people,
    entries: review.entries,
    photos: {
      count: photos.count,
      bytes: photos.bytes,
      missing: photos.missing,
    },
    issues,
    blocking,
  };
}

async function readSource(payload: UploadPayload) {
  if (payload.document) {
    return {
      document: await normalizeUpload({
        kind: payload.kind,
        document: payload.document,
        workbook: null,
      }),
      sheetIssues: [] as SheetIssue[],
    };
  }
  // A bare workbook: the user's own edits are the only source of truth.
  if (!payload.workbook) {
    throw new HTTPException(400, { message: "文件里没有可导入的数据" });
  }
  const parsed = await readWorkbook(payload.workbook);
  return {
    document: await normalizeUpload({
      kind: payload.kind,
      document: null,
      workbook: parsed,
    }),
    sheetIssues: parsed.issues,
  };
}

type TargetContext = {
  ledgerId: string;
  accounts: Awaited<ReturnType<typeof accountRepository.listByLedger>>;
  members: Awaited<ReturnType<typeof ledgerMemberRepository.listByLedger>>;
  projects: Awaited<ReturnType<typeof projectRepository.listByLedger>>;
};

async function resolveTargetLedger(
  userId: string,
  ledgerId: string,
): Promise<TargetContext> {
  const access = await requireLedgerAccess(userId, ledgerId, "editor");
  assertLedgerWritable(access.ledger);
  const [accounts, members, projects] = await Promise.all([
    accountRepository.listByLedger(ledgerId),
    ledgerMemberRepository.listByLedger(ledgerId),
    projectRepository.listByLedger(ledgerId),
  ]);
  return { ledgerId, accounts, members, projects };
}

/**
 * Accounts resolve by `code` first — the seeded set's permanent identity,
 * the same key starter accounts and every client rename rely on — then by
 * (type, name) for the user's own categories. Only what's left is created.
 */
function resolveAccounts(
  document: NormalizedImport,
  target: TargetContext | null,
): ResolvedAccount[] {
  const byCode = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const account of target?.accounts ?? []) {
    if (account.code) byCode.set(account.code, account.id);
    byName.set(
      `${account.type}:${account.name ?? account.code ?? ""}`,
      account.id,
    );
  }
  return document.accounts.map((account) => {
    const existing =
      (account.code ? byCode.get(account.code) : undefined) ??
      byName.get(`${account.type}:${account.name ?? ""}`);
    if (existing) {
      if (account.code) byCode.set(account.code, existing);
      byName.set(`${account.type}:${account.name ?? ""}`, existing);
    }
    return {
      key: account.key,
      label: account.name ?? account.code ?? "(未命名)",
      action: existing ? ("reuse" as const) : ("create" as const),
      ...(existing ? { targetId: existing } : {}),
    };
  });
}

function resolveProjects(
  document: NormalizedImport,
  target: TargetContext | null,
): ResolvedProject[] {
  const byName = new Map(
    (target?.projects ?? []).map((project) => [project.name, project.id]),
  );
  return document.projects.map((project) => {
    const existing = byName.get(project.name);
    if (existing) byName.delete(project.name);
    return {
      key: project.key,
      name: project.name,
      action: existing ? ("reuse" as const) : ("create" as const),
      ...(existing ? { targetId: existing } : {}),
    };
  });
}

/**
 * People resolve against the target ledger's roster by email, then by
 * name. Deliberately NOT against the platform's user table: an import must
 * never pull a stranger into a ledger by virtue of their email appearing in
 * a file. Anyone left over becomes a virtual member — the same placeholder
 * the share surface creates for someone who'll never register — up to the
 * per-ledger cap, past which the tag is dropped.
 */
async function resolvePeople(
  userId: string,
  document: NormalizedImport,
  target: TargetContext | null,
): Promise<ResolvedPerson[]> {
  const importer = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });
  const byEmail = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const member of target?.members ?? []) {
    if (member.user.email) {
      byEmail.set(member.user.email.toLowerCase(), member.userId);
    }
    byName.set(member.user.name, member.userId);
  }
  if (importer?.email) byEmail.set(importer.email.toLowerCase(), userId);
  if (importer?.name) byName.set(importer.name, userId);

  const resolved: ResolvedPerson[] = [];
  let virtualCount = 0;
  for (const person of document.people) {
    const existing =
      (person.email ? byEmail.get(person.email.toLowerCase()) : undefined) ??
      byName.get(person.name);
    if (existing) {
      resolved.push({
        key: person.key,
        name: person.name,
        email: person.email,
        action: "reuse",
        targetId: existing,
      });
      continue;
    }
    if (virtualCount >= MAX_IMPORT_VIRTUAL_MEMBERS) {
      resolved.push({
        key: person.key,
        name: person.name,
        email: person.email,
        action: "drop",
      });
      continue;
    }
    virtualCount++;
    resolved.push({
      key: person.key,
      name: person.name,
      email: person.email,
      action: "create",
    });
  }
  return resolved;
}

function collectPhotos(document: NormalizedImport, payload: UploadPayload) {
  const names = document.entries.flatMap((entry) => entry.photoFiles);
  const missing: string[] = [];
  let bytes = 0;
  for (const name of names) {
    const buffer = payload.photos.get(name);
    if (!buffer) {
      if (!missing.includes(name)) missing.push(name);
      continue;
    }
    bytes += buffer.length;
  }
  return { count: names.length, bytes, missing };
}

/**
 * Entry-level checks that need no database: the lines must reference known
 * accounts and the entry must balance. Anything that fails is reported
 * against its key and skipped — one bad row in a hand-edited spreadsheet
 * must not cost the user the other 4,999.
 */
function reviewEntries(
  document: NormalizedImport,
  accounts: ResolvedAccount[],
  projects: ResolvedProject[],
  existingFingerprints: Set<string>,
  missingPhotos: Set<string>,
  issues: ImportIssue[],
): { entries: ImportPlan["entries"]; toPost: NormalizedEntry[] } {
  // Every resolved account exists in the target by the time entries post:
  // `reuse` points at a row that's already there, `create` makes one first.
  // A line outside this set references an account the file never carried.
  const usableAccountKeys = new Set(accounts.map((account) => account.key));
  const projectKeys = new Set(projects.map((project) => project.key));
  let importable = 0;
  let duplicates = 0;
  let invalid = 0;
  const toPost: NormalizedEntry[] = [];

  for (const entry of document.entries) {
    const where = `entry:${entry.key || entry.dayKey}`;
    if (entry.lines.length < 2) {
      invalid++;
      issues.push({ where, message: "一笔流水至少需要两行分录" });
      continue;
    }
    let debit = 0;
    let credit = 0;
    let broken = false;
    for (const line of entry.lines) {
      if (!usableAccountKeys.has(line.accountKey)) {
        invalid++;
        broken = true;
        issues.push({
          where: `line:${entry.key}#${line.lineNo}`,
          message: `账户键 ${line.accountKey || "(空)"} 在账户表里不存在`,
        });
        continue;
      }
      debit += line.debitCents;
      credit += line.creditCents;
    }
    if (broken) continue;
    if (debit !== credit) {
      invalid++;
      issues.push({
        where,
        message: `借贷不平：借方 ${(debit / 100).toFixed(2)}，贷方 ${(credit / 100).toFixed(2)}`,
      });
      continue;
    }
    if (entry.projectKey && !projectKeys.has(entry.projectKey)) {
      issues.push({
        where,
        message: `项目键 ${entry.projectKey} 不在项目表里，这条流水的项目标记将丢失`,
      });
    }
    const missingHere = entry.photoFiles.filter((name) =>
      missingPhotos.has(name),
    );
    if (missingHere.length > 0) {
      issues.push({
        where,
        message: `${missingHere.length} 张照片在文件里缺失，这些照片不会导入`,
      });
    }
    if (existingFingerprints.has(entryFingerprint(entry))) {
      duplicates++;
      continue;
    }
    importable++;
    toPost.push(entry);
  }

  return {
    entries: {
      total: document.entries.length,
      importable,
      duplicates,
      invalid,
    },
    toPost,
  };
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

async function writeImport(
  userId: string,
  target: ImportTarget,
  plan: ImportPlan,
  payload: UploadPayload,
  openLedger: (tx: Prisma.TransactionClient) => Promise<string>,
): Promise<ImportResult["created"]> {
  const context: WriteContext = {
    accountIdByKey: new Map(),
    projectIdByKey: new Map(),
    userIdByPersonKey: new Map(),
  };
  const created: ImportResult["created"] = {
    accounts: 0,
    projects: 0,
    people: 0,
    entries: 0,
    photos: 0,
  };

  // One transaction for the setup phase: accounts, people, projects,
  // budgets and the importer's own preferences either all land together or
  // the ledger stays empty and the user retries cleanly.
  let ledgerId = "";
  await prisma.$transaction(
    async (tx) => {
      ledgerId = target.mode === "new" ? await openLedger(tx) : target.ledgerId;
      const realAccountIdByKey = await writeRealAccounts(userId, plan, tx);
      created.accounts = await writeAccounts(
        ledgerId,
        plan,
        realAccountIdByKey,
        context,
        tx,
      );
      created.people = await writePeople(ledgerId, plan, context, tx);
      created.projects = await writeProjects(ledgerId, plan, context, tx);
      await writeBudgets(ledgerId, plan, context, tx);
    },
    { timeout: 60_000, maxWait: 10_000 },
  );

  await writePreferences(userId, ledgerId, plan);

  // Entries chunk, and so do their photos: staging is a file write, and
  // holding the ledger lock across a thousand images is exactly the stall
  // the chunking exists to avoid.
  //
  // The list is the plan's survivors, NOT the file's entries: the preview
  // already rejected the duplicates and the rows it couldn't read, and
  // posting those here would both duplicate the target ledger and let one
  // malformed row roll back a whole chunk.
  const chunks = chunked(plan.entriesToPost, IMPORT_CHUNK_SIZE);
  for (const chunk of chunks) {
    const result = await prisma.$transaction(
      async (tx) => {
        await lockLedgerRow(tx, ledgerId);
        const ledger = await ledgerRepository.findById(ledgerId, tx);
        if (!ledger) {
          throw new HTTPException(404, { message: "Ledger not found" });
        }
        assertLedgerWritable(ledger);

        const [ledgerAccounts, ledgerMembers] = await Promise.all([
          accountRepository.listByLedger(ledgerId, tx),
          ledgerMemberRepository.listByLedger(ledgerId, tx),
        ]);
        return writeChunk(
          userId,
          ledgerId,
          ledger,
          chunk,
          plan,
          payload,
          context,
          ledgerAccounts,
          ledgerMembers,
          tx,
        );
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    created.entries += result.entries;
    created.photos += result.photos;
  }

  return created;
}

/** The masters are the importing user's own private records, so they match
 *  by name rather than by key: an export of someone else's ledger
 *  legitimately carries ids that mean nothing in this account. */
async function writeRealAccounts(
  userId: string,
  plan: ImportPlan,
  tx: Prisma.TransactionClient,
): Promise<Map<string, string>> {
  const byDocumentKey = new Map<string, string>();
  if (plan.document.realAccounts.length === 0) return byDocumentKey;

  const owned = await realAccountRepository.listWithPockets(userId, tx);
  const byName = new Map(owned.map((account) => [account.name, account.id]));

  for (const account of plan.document.realAccounts) {
    const existing = byName.get(account.name);
    if (existing) {
      byDocumentKey.set(account.key, existing);
      continue;
    }
    const created = await realAccountRepository.create(
      {
        ownerId: userId,
        name: account.name,
        type: account.type,
        icon: account.icon ?? undefined,
        meta:
          typeof account.meta === "object" && account.meta !== null
            ? (account.meta as Record<string, unknown>)
            : undefined,
      },
      tx,
    );
    byDocumentKey.set(account.key, created.id);
  }
  return byDocumentKey;
}

/**
 * Parents before children. The product's own tree is one level deep, but a
 * hand-made file can point a parentKey at another keyed account, so this
 * loops until nothing more resolves and imports whatever never did as a
 * root rather than dropping it.
 */
async function writeAccounts(
  ledgerId: string,
  plan: ImportPlan,
  realAccountIdByKey: Map<string, string>,
  context: WriteContext,
  tx: Prisma.TransactionClient,
): Promise<number> {
  let created = 0;
  const sourceByKey = new Map(
    plan.document.accounts.map((row) => [row.key, row]),
  );

  // Accounts a merge is reusing are already in the target under their own
  // ids, so the key map starts with them — without this, a merged entry's
  // lines would resolve to nothing and the entry would be dropped without
  // a word.
  for (const account of plan.accounts) {
    if (account.action === "reuse" && account.targetId) {
      context.accountIdByKey.set(account.key, account.targetId);
    }
  }

  let pending = plan.accounts.filter((account) => account.action === "create");

  const create = async (resolution: ResolvedAccount) => {
    const source = sourceByKey.get(resolution.key);
    if (!source) return;
    const row = await accountRepository.create(
      {
        ledgerId,
        name: source.name ?? source.code ?? null,
        code: source.code,
        type: source.type,
        sortOrder: source.sortOrder,
        parentId: source.parentKey
          ? (context.accountIdByKey.get(source.parentKey) ?? null)
          : null,
        icon: source.icon,
        flags: source.flags,
        meta: asMeta(source.meta),
        realAccountId: source.realAccountKey
          ? (realAccountIdByKey.get(source.realAccountKey) ?? null)
          : null,
      },
      tx,
    );
    context.accountIdByKey.set(resolution.key, row.id);
    resolution.targetId = row.id;
    created++;
  };

  while (pending.length > 0) {
    const creatable = pending.filter((resolution) => {
      const parentKey = sourceByKey.get(resolution.key)?.parentKey;
      return !parentKey || context.accountIdByKey.has(parentKey);
    });
    if (creatable.length === 0) {
      for (const orphan of pending) {
        plan.issues.push({
          where: `accounts:${orphan.key}`,
          message: "上级账户不存在，该账户按顶级导入",
        });
        await create(orphan);
      }
      break;
    }
    for (const resolution of creatable) await create(resolution);
    const done = new Set(creatable.map((account) => account.key));
    pending = pending.filter((account) => !done.has(account.key));
  }

  return created;
}

async function writePeople(
  ledgerId: string,
  plan: ImportPlan,
  context: WriteContext,
  tx: Prisma.TransactionClient,
): Promise<number> {
  let created = 0;
  for (const person of plan.people) {
    if (person.action === "reuse" && person.targetId) {
      context.userIdByPersonKey.set(person.key, person.targetId);
    }
    if (person.action !== "create") continue;
    const user = await tx.user.create({
      data: { name: person.name, flags: [VIRTUAL_USER_FLAG] },
    });
    await ledgerMemberRepository.create(
      { ledgerId, userId: user.id, role: "viewer" },
      tx,
    );
    person.targetId = user.id;
    person.action = "reuse";
    context.userIdByPersonKey.set(person.key, user.id);
    created++;
  }
  return created;
}

async function writeProjects(
  ledgerId: string,
  plan: ImportPlan,
  context: WriteContext,
  tx: Prisma.TransactionClient,
): Promise<number> {
  let created = 0;
  for (const project of plan.projects) {
    if (project.action === "reuse" && project.targetId) {
      context.projectIdByKey.set(project.key, project.targetId);
      continue;
    }
    const source = plan.document.projects.find(
      (row) => row.key === project.key,
    );
    if (!source) continue;
    const row = await projectRepository.create(
      {
        ledgerId,
        name: source.name,
        description: source.description,
        startDate: source.startDate,
        endDate: source.endDate,
      },
      tx,
    );
    project.targetId = row.id;
    project.action = "reuse";
    context.projectIdByKey.set(project.key, row.id);
    created++;
    for (const memberKey of source.memberKeys) {
      const userId = context.userIdByPersonKey.get(memberKey);
      if (userId) {
        await projectMemberRepository.create({ projectId: row.id, userId }, tx);
      }
    }
  }
  return created;
}

async function writeBudgets(
  ledgerId: string,
  plan: ImportPlan,
  context: WriteContext,
  tx: Prisma.TransactionClient,
) {
  for (const budget of plan.document.budgets) {
    if (budget.kind === "year") {
      await budgetRepository.upsertYear(
        ledgerId,
        { year: budget.year, cents: budget.cents },
        tx,
      );
    } else if (budget.kind === "month") {
      // A month override with no year row is a state the settings surface
      // can't express; a well-formed file has just created the year above.
      const yearRow = await budgetRepository.findYear(
        ledgerId,
        budget.year,
        tx,
      );
      if (yearRow && budget.month !== null) {
        await budgetRepository.upsertMonthOverride(
          yearRow.id,
          { month: budget.month, cents: budget.cents },
          tx,
        );
      }
    } else {
      const accountId = budget.accountKey
        ? context.accountIdByKey.get(budget.accountKey)
        : undefined;
      if (!accountId) continue;
      await categoryBudgetRepository.upsert(
        ledgerId,
        { year: budget.year, accountId, cents: budget.cents },
        tx,
      );
    }
  }

  const excluded = plan.document.budgetExcludedAccountKeys
    .map((key) => context.accountIdByKey.get(key))
    .filter((id): id is string => typeof id === "string");
  if (excluded.length > 0) {
    await budgetRepository.setExcludedAccountIds(ledgerId, excluded, tx);
  }
}

/**
 * Only the chip arrangement travels. A chip list is a list of strings, so
 * nothing in a file can smuggle a payload the settings route would have
 * rejected — anything but that one key is dropped rather than trusted.
 */
async function writePreferences(
  userId: string,
  ledgerId: string,
  plan: ImportPlan,
) {
  const quickEntry = plan.document.preferences.find(
    (preference) => preference.key === "quickEntry",
  );
  if (!quickEntry) return;
  const chipFields = (
    quickEntry.value as { chipFields?: unknown } | null | undefined
  )?.chipFields;
  if (
    !Array.isArray(chipFields) ||
    !chipFields.every((field) => typeof field === "string")
  ) {
    plan.issues.push({
      where: "preferences:quickEntry",
      message: "快速录入偏好格式无法识别，已跳过",
    });
    return;
  }
  await preferenceRepository.upsert(userId, "ledger", ledgerId, {
    quickEntry: { chipFields },
  });
}

async function writeChunk(
  userId: string,
  ledgerId: string,
  ledger: { lastEntryNo: number },
  chunk: NormalizedEntry[],
  plan: ImportPlan,
  payload: UploadPayload,
  context: WriteContext,
  ledgerAccounts: Awaited<ReturnType<typeof accountRepository.listByLedger>>,
  ledgerMembers: Awaited<
    ReturnType<typeof ledgerMemberRepository.listByLedger>
  >,
  tx: Prisma.TransactionClient,
): Promise<{ entries: number; photos: number }> {
  let entries = 0;
  let photos = 0;
  // Looked up once per chunk rather than per entry: the member split below
  // reads it for every project entry.
  const projectMemberKeys = new Map(
    plan.document.projects.map((project) => [project.key, project.memberKeys]),
  );
  // The entry number comes off the ledger row's counter, which the journal
  // service advances in the database but not in the object it was handed. A
  // rejected entry may have advanced it before failing, so the handle is
  // re-read from the row after a failure — otherwise every entry after it in
  // the chunk would be handed a number that is already taken.
  let ledgerRow = ledger;

  for (const entry of chunk) {
    const lines: JournalLineInput[] = entry.lines.map((line) => {
      const accountId = context.accountIdByKey.get(line.accountKey);
      return {
        ...(accountId ? { accountId } : {}),
        debit: line.debitCents / 100,
        credit: line.creditCents / 100,
        ...(line.memo ? { memo: line.memo } : {}),
      };
    });
    if (lines.some((line) => !line.accountId)) continue;

    const projectId = entry.projectKey
      ? context.projectIdByKey.get(entry.projectKey)
      : undefined;
    // A project entry the source left untagged split across the project's
    // members as they stood at the time. That set is frozen here rather
    // than left to re-split against today's membership, or a member who
    // leaves would silently rewrite what they owe.
    const participantUserIds = (
      entry.participantKeys.length > 0
        ? entry.participantKeys
        : entry.projectKey
          ? (projectMemberKeys.get(entry.projectKey) ?? [])
          : []
    )
      .map((key) => context.userIdByPersonKey.get(key))
      .filter((id): id is string => typeof id === "string");

    const paidByUserId = entry.paidByKey
      ? context.userIdByPersonKey.get(entry.paidByKey)
      : undefined;

    let created: { id: string };
    try {
      created = await postEntryInTransaction(tx, userId, ledgerId, ledgerRow, {
        date: entry.date,
        ...(entry.memo ? { memo: entry.memo } : {}),
        ...(entry.merchant ? { merchant: entry.merchant } : {}),
        rawLines: lines,
        ledgerAccounts,
        ledgerMembers,
        ...(projectId ? { projectId } : {}),
        ...(participantUserIds.length > 0 ? { participantUserIds } : {}),
        ...(paidByUserId ? { paidByUserId } : {}),
        countsInLedger: entry.countsInLedger,
        excludedFromBudget: entry.excludedFromBudget,
        ...(entry.location ? { location: locationInput(entry.location) } : {}),
      });
    } catch (error) {
      // A 400 from the journal's own validators is this row's problem, not
      // the chunk's: a zero-value line reads as balanced but isn't postable,
      // for one. Everything else (a database failure, a constraint) still
      // propagates and rolls the chunk back, which is the correct blast
      // radius for those.
      if (!(error instanceof HTTPException)) throw error;
      plan.issues.push({
        where: `entry:${entry.key || entry.dayKey}`,
        message: `跳过：${error.message}`,
      });
      const refreshed = await ledgerRepository.findById(ledgerId, tx);
      if (refreshed) ledgerRow = refreshed;
      continue;
    }

    // Photos stage against the ledger and are claimed by the entry that
    // just landed, in this same transaction — the live uploader's two
    // steps, minus the round trips. An entry capped at 9 keeps the first 9.
    const staged: string[] = [];
    for (const name of entry.photoFiles.slice(0, 9)) {
      const bytes = payload.photos.get(name);
      if (!bytes) continue;
      const mimeType = mimeTypeOf(name, bytes);
      if (!mimeType || !PHOTO_MEDIA_TYPES.has(mimeType)) continue;
      const attachment = await createAttachment({
        file: new File([Uint8Array.from(bytes)], name, { type: mimeType }),
        visibility: "private",
        uploaderId: userId,
        bizType: JOURNAL_ENTRY_BIZ_TYPE,
        bizId: ledgerId,
        tx,
      });
      staged.push(attachment.attachmentId);
      photos++;
    }
    if (staged.length > 0) {
      await claimEntryAttachments(tx, userId, ledgerId, created.id, staged);
    }
    entries++;
  }

  return { entries, photos };
}

// ---------------------------------------------------------------------------
// Dedupe
// ---------------------------------------------------------------------------

/**
 * The merge dedupe key: local day, the free-text fields, the project's
 * NAME, and the lines against each account's stable identity.
 *
 * Local day rather than the instant, so a file exported in one timezone
 * still matches its own entries when merged from another; project name
 * rather than key, and account identity rather than id, so the key is
 * comparable across two different ledgers.
 */
export function entryFingerprint(entry: {
  dayKey: string;
  memo: string | null;
  merchant: string | null;
  projectName: string | null;
  lines: Array<{
    accountIdentity: string;
    debitCents: number;
    creditCents: number;
  }>;
}): string {
  const lines = entry.lines
    .map(
      (line) =>
        `${line.accountIdentity}:${line.debitCents}:${line.creditCents}`,
    )
    .sort()
    .join(";");
  return createHash("sha256")
    .update(
      [
        entry.dayKey,
        entry.memo ?? "",
        entry.merchant ?? "",
        entry.projectName ?? "",
        lines,
      ].join("|"),
    )
    .digest("hex");
}

async function existingEntryFingerprints(
  target: TargetContext,
  tzOffsetMinutes: number,
): Promise<Set<string>> {
  const fingerprints = new Set<string>();
  const identityByAccountId = new Map(
    target.accounts.map((account) => [account.id, accountIdentityOf(account)]),
  );
  let offset = 0;
  for (;;) {
    const page = await prisma.journalEntry.findMany({
      where: { ledgerId: target.ledgerId },
      include: {
        lines: { select: { accountId: true, debit: true, credit: true } },
        project: { select: { name: true } },
      },
      orderBy: [{ date: "asc" }, { entryNo: "asc" }],
      take: FINGERPRINT_PAGE_SIZE,
      skip: offset,
    });
    if (page.length === 0) break;
    for (const entry of page) {
      fingerprints.add(
        entryFingerprint({
          dayKey: instantToDayKey(entry.date, tzOffsetMinutes),
          memo: entry.memo,
          merchant: entry.merchant,
          projectName: entry.project?.name ?? null,
          lines: entry.lines.map((line) => ({
            accountIdentity:
              identityByAccountId.get(line.accountId) ?? line.accountId,
            debitCents: Math.round(Number(line.debit) * 100),
            creditCents: Math.round(Number(line.credit) * 100),
          })),
        }),
      );
    }
    if (page.length < FINGERPRINT_PAGE_SIZE) break;
    offset += page.length;
  }
  return fingerprints;
}

function accountIdentityOf(account: {
  code: string | null;
  type: string;
  name: string | null;
}): string {
  return account.code
    ? `code:${account.code}`
    : `name:${account.type}:${account.name ?? ""}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function* chunked<T>(items: T[], size: number): Generator<T[]> {
  for (let index = 0; index < items.length; index += size) {
    yield items.slice(index, index + size);
  }
}

/** The entry body's location takes absent-over-null (omitted = keep), while
 *  the normalized shape carries explicit nulls; the translation is here so
 *  the two never disagree about what "no location" means. */
function locationInput(location: {
  address: string | null;
  addressName: string | null;
  latitude: number | null;
  longitude: number | null;
}) {
  return {
    ...(location.address ? { address: location.address } : {}),
    ...(location.addressName ? { addressName: location.addressName } : {}),
    ...(location.latitude === null ? {} : { latitude: location.latitude }),
    ...(location.longitude === null ? {} : { longitude: location.longitude }),
  };
}

function asMeta(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

/** The export always names its photos with a usable extension; the
 *  signature sniff is only here so a hand-zipped archive still restores. */
function mimeTypeOf(name: string, bytes: Buffer): string | null {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  const byExtension = MIME_BY_EXTENSION[extension];
  if (byExtension) return byExtension;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes.subarray(0, 3).toString("ascii") === "GIF") return "image/gif";
  return null;
}
