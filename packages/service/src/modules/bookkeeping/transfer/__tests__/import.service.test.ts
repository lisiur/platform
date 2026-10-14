import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/db", () => ({
  prisma: {
    $transaction: vi.fn(),
    user: { findUnique: vi.fn(), create: vi.fn() },
    ledger: { findMany: vi.fn() },
    journalEntry: { findMany: vi.fn() },
  },
}));

vi.mock("#modules/attachment/attachment.service", () => ({
  createAttachment: vi.fn(),
  deleteAttachmentsByIds: vi.fn(),
  JOURNAL_ENTRY_BIZ_TYPE: "qianlai:journal-entry",
  PHOTO_MEDIA_TYPES: new Set(["image/jpeg", "image/png"]),
}));

vi.mock("../../access", () => ({
  requireLedgerAccess: vi.fn(),
  assertLedgerWritable: vi.fn((ledger: { status: string }) => {
    if (ledger.status !== "active") {
      throw new Error("This ledger is archived");
    }
  }),
}));

vi.mock("../../account.repository", () => ({
  accountRepository: { listByLedger: vi.fn(), create: vi.fn() },
}));
vi.mock("../../budget.repository", () => ({
  budgetRepository: {
    findYear: vi.fn(),
    upsertYear: vi.fn(),
    upsertMonthOverride: vi.fn(),
    setExcludedAccountIds: vi.fn(),
  },
}));
vi.mock("../../category-budget.repository", () => ({
  categoryBudgetRepository: { upsert: vi.fn() },
}));
vi.mock("../../journal.service", () => ({
  postEntryInTransaction: vi.fn(),
  claimEntryAttachments: vi.fn(),
}));
vi.mock("../../ledger-member.repository", () => ({
  ledgerMemberRepository: { listByLedger: vi.fn(), create: vi.fn() },
}));
vi.mock("../../ledger.repository", () => ({
  ledgerRepository: {
    findById: vi.fn(),
    listForUser: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  lockLedgerRow: vi.fn(),
}));
vi.mock("../../preference.repository", () => ({
  preferenceRepository: { upsert: vi.fn() },
}));
vi.mock("../../project-member.repository", () => ({
  projectMemberRepository: { create: vi.fn() },
}));
vi.mock("../../project.repository", () => ({
  projectRepository: { listByLedger: vi.fn(), create: vi.fn() },
}));
vi.mock("../../real-account.repository", () => ({
  realAccountRepository: { listWithPockets: vi.fn(), create: vi.fn() },
}));

import { prisma } from "#lib/db";
import { createAttachment } from "#modules/attachment/attachment.service";
import { requireLedgerAccess } from "../../access";
import { accountRepository } from "../../account.repository";
import { budgetRepository } from "../../budget.repository";
import {
  claimEntryAttachments,
  postEntryInTransaction,
} from "../../journal.service";
import { ledgerRepository } from "../../ledger.repository";
import { ledgerMemberRepository } from "../../ledger-member.repository";
import { preferenceRepository } from "../../preference.repository";
import { projectRepository } from "../../project.repository";
import {
  commitImport,
  entryFingerprint,
  MAX_IMPORT_ENTRIES,
  previewImport,
  previewToken,
} from "../import.service";
import type { UploadPayload } from "../zip";

const USER = "usr_me";

/**
 * A minimal but complete export document, typed so the tests can mutate it
 * the way a user would mutate a spreadsheet (an email filled in, an amount
 * broken, a receipt listed but missing).
 */
type MutableDocument = {
  formatVersion: number;
  exportedAt: string;
  timezoneOffsetMinutes: number;
  ledger: {
    key: string;
    name: string;
    description: string | null;
    currency: string;
    status: string;
    isDefault: boolean;
    createdAt: string;
  };
  budgetExcludedAccountKeys: string[];
  accounts: Array<{
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
  }>;
  entries: Array<{
    key: string;
    entryNo: number;
    date: string;
    memo: string | null;
    merchant: string | null;
    status: string;
    countsInLedger: boolean;
    excludedFromBudget: boolean;
    guestCreated: boolean;
    projectKey: string | null;
    paidByKey: string | null;
    createdByKey: string | null;
    createdAt: string;
    location: unknown;
    participants: Array<{ key: string; name: string; email: string | null }>;
    lines: Array<{
      accountKey: string;
      debitCents: number;
      creditCents: number;
      memo: string | null;
    }>;
    attachments: Array<{
      file: string;
      mimeType: string;
      size: number;
      hash: string;
    }>;
  }>;
  projects: unknown[];
  members: Array<{
    key: string;
    name: string;
    email: string | null;
    role: string;
    isVirtual: boolean;
    createdAt: string;
  }>;
  budgets: Array<{
    kind: "year" | "month" | "category";
    year: number;
    month: number | null;
    accountKey: string | null;
    cents: number;
  }>;
  realAccounts: unknown[];
  preferences: Array<{
    scope: string;
    scopeKey: string;
    key: string;
    value: unknown;
  }>;
};

function baseDocument(): MutableDocument {
  return {
    formatVersion: 1,
    exportedAt: "2026-08-22T10:00:00.000Z",
    timezoneOffsetMinutes: 480,
    ledger: {
      key: "src_1",
      name: "旧账本",
      description: null,
      currency: "CNY",
      status: "active",
      isDefault: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    budgetExcludedAccountKeys: ["src_acc_food"],
    accounts: [
      {
        key: "src_acc_food",
        name: null,
        code: "food",
        type: "expense",
        parentKey: null,
        sortOrder: 200,
        icon: null,
        status: "active",
        flags: [],
        meta: null,
        realAccountKey: null,
      },
      {
        key: "src_acc_meals",
        name: "午饭",
        code: "meals",
        type: "expense",
        parentKey: "src_acc_food",
        sortOrder: 201,
        icon: null,
        status: "active",
        flags: [],
        meta: null,
        realAccountKey: null,
      },
    ],
    entries: [
      {
        key: "src_ent_1",
        entryNo: 1,
        date: "2026-08-21T16:00:00.000Z",
        memo: "午饭",
        merchant: null,
        status: "posted",
        countsInLedger: true,
        excludedFromBudget: false,
        guestCreated: false,
        projectKey: null,
        paidByKey: null,
        createdByKey: "src_usr_alice",
        createdAt: "2026-08-21T16:05:00.000Z",
        location: null,
        participants: [{ key: "src_usr_alice", name: "Alice", email: null }],
        lines: [
          {
            accountKey: "src_acc_meals",
            debitCents: 3550,
            creditCents: 0,
            memo: null,
          },
          {
            accountKey: "src_acc_food",
            debitCents: 0,
            creditCents: 3550,
            memo: null,
          },
        ],
        attachments: [],
      },
    ],
    projects: [],
    members: [
      {
        key: "src_usr_alice",
        name: "Alice",
        email: null,
        role: "owner",
        isVirtual: false,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    budgets: [],
    realAccounts: [],
    preferences: [],
  };
}

function payload(
  document: unknown,
  photos: Map<string, Buffer> = new Map(),
): UploadPayload {
  return {
    kind: document ? "archive" : "workbook",
    document: document as never,
    workbook: null,
    photos,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // The transaction handle carries the models the write phase uses
  // directly (`tx.user.create` for a virtual member); everything else goes
  // through a repository, which is mocked.
  vi.mocked(prisma.$transaction).mockImplementation((async (
    fn: (tx: unknown) => Promise<unknown>,
  ) =>
    fn({
      user: prisma.user,
      bookAccount: { update: vi.fn() },
    })) as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    name: "我",
    email: "me@example.com",
  } as never);
  vi.mocked(prisma.user.create).mockImplementation((async () => ({
    id: "usr_virtual",
  })) as never);
  vi.mocked(prisma.ledger.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([] as never);
  vi.mocked(ledgerRepository.listForUser).mockResolvedValue([] as never);
  vi.mocked(ledgerRepository.create).mockResolvedValue({
    id: "new_led",
  } as never);
  vi.mocked(ledgerRepository.findById).mockResolvedValue({
    id: "tgt_led",
    lastEntryNo: 0,
    status: "active",
  } as never);
  vi.mocked(ledgerMemberRepository.listByLedger).mockResolvedValue([] as never);
  vi.mocked(accountRepository.listByLedger).mockResolvedValue([] as never);
  vi.mocked(projectRepository.listByLedger).mockResolvedValue([] as never);
  vi.mocked(requireLedgerAccess).mockResolvedValue({
    ledger: { id: "tgt_led", ownerId: USER, status: "active", name: "目标" },
    membership: { role: "editor" },
  } as never);
  vi.mocked(postEntryInTransaction).mockResolvedValue({
    id: "new_ent",
  } as never);
  vi.mocked(createAttachment).mockResolvedValue({
    attachmentId: "att_new",
    uploadId: "up_new",
    url: "/api/attachment/att_new",
  } as never);
});

describe("import preview", () => {
  it("plans a restore into a brand new ledger without touching one", async () => {
    const plan = await previewImport(USER, payload(baseDocument()), {
      mode: "new",
    });

    expect(plan.blocking).toEqual([]);
    expect(plan.entries).toEqual({
      total: 1,
      importable: 1,
      duplicates: 0,
      invalid: 0,
    });
    // Nothing is created by a preview.
    expect(ledgerRepository.create).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("resolves seeded accounts by code and user categories by name", async () => {
    vi.mocked(accountRepository.listByLedger).mockResolvedValue([
      {
        id: "tgt_food",
        code: "food",
        name: null,
        type: "expense",
        sortOrder: 200,
        status: "active",
        flags: [],
        parentId: null,
        icon: null,
        meta: null,
        realAccountId: null,
      },
      {
        id: "tgt_meals",
        code: null,
        name: "午饭",
        type: "expense",
        sortOrder: 0,
        status: "active",
        flags: [],
        parentId: null,
        icon: null,
        meta: null,
        realAccountId: null,
      },
    ] as never);

    const plan = await previewImport(USER, payload(baseDocument()), {
      mode: "merge",
      ledgerId: "tgt_led",
    });
    expect(plan.accounts.every((account) => account.action === "reuse")).toBe(
      true,
    );
    expect(plan.accounts.every((account) => account.targetId)).toBe(true);
  });

  it("reuses a person already on the target ledger by name", async () => {
    vi.mocked(ledgerMemberRepository.listByLedger).mockResolvedValue([
      {
        userId: "tgt_alice",
        role: "viewer",
        createdAt: new Date(),
        user: { id: "tgt_alice", name: "Alice", email: null, flags: [] },
      },
    ] as never);

    // Merge mode: a fresh ledger has no roster to match against, which is
    // exactly why a restore into a new account turns people into
    // placeholders rather than into the source ledger's users.
    const plan = await previewImport(USER, payload(baseDocument()), {
      mode: "merge",
      ledgerId: "tgt_led",
    });
    expect(plan.people[0]).toMatchObject({
      name: "Alice",
      action: "reuse",
      targetId: "tgt_alice",
    });
  });

  it("makes a virtual member for someone who isn't on the ledger", async () => {
    const plan = await previewImport(USER, payload(baseDocument()), {
      mode: "new",
    });
    expect(plan.people[0].action).toBe("create");
    expect(plan.people[0].targetId).toBeUndefined();
  });

  it("never pulls a stranger in by their email appearing in a file", async () => {
    const document = baseDocument();
    document.members[0].email = "alice@example.com";
    const plan = await previewImport(USER, payload(document), { mode: "new" });
    // The importer's own email is the only one the resolver can match on;
    // Alice's is not in the target roster, so she becomes a placeholder.
    expect(plan.people[0]).toMatchObject({ action: "create", name: "Alice" });
  });

  it("reports an unbalanced entry and keeps the rest of the file", async () => {
    const document = baseDocument();
    document.entries[0].lines[1].creditCents = 3000;
    const plan = await previewImport(USER, payload(document), { mode: "new" });

    expect(plan.entries).toMatchObject({ total: 1, importable: 0, invalid: 1 });
    expect(plan.issues[0].where).toBe("entry:src_ent_1");
    expect(plan.issues[0].message).toContain("借贷不平");
  });

  it("reports a line pointing at an account the file doesn't carry", async () => {
    const document = baseDocument();
    document.entries[0].lines[0].accountKey = "src_acc_ghost";
    const plan = await previewImport(USER, payload(document), { mode: "new" });

    expect(plan.entries.invalid).toBe(1);
    expect(plan.issues[0].where).toBe("line:src_ent_1#1");
    expect(plan.issues[0].message).toContain("src_acc_ghost");
  });

  it("counts every entry in the file, duplicates and rejects included", async () => {
    const document = baseDocument();
    document.entries = Array.from({ length: 3 }, (_, index) => ({
      ...document.entries[0],
      key: `src_ent_${index}`,
    }));
    const plan = await previewImport(USER, payload(document), { mode: "new" });
    expect(plan.entries).toMatchObject({
      total: 3,
      importable: 3,
      duplicates: 0,
      invalid: 0,
    });
    // The cap is the export's ceiling too, so the two agree on what a
    // ledger too big to export is a ledger too big to import.
    expect(MAX_IMPORT_ENTRIES).toBe(20_000);
  });

  it("warns about a receipt the archive doesn't carry", async () => {
    const document = baseDocument();
    document.entries[0].attachments = [
      { file: "E000001-1.jpg", mimeType: "image/jpeg", size: 10, hash: "h" },
    ];
    const plan = await previewImport(USER, payload(document), { mode: "new" });
    expect(plan.photos).toMatchObject({ count: 1, bytes: 0 });
    expect(plan.photos.missing).toEqual(["E000001-1.jpg"]);
    expect(plan.issues.some((issue) => issue.message.includes("照片"))).toBe(
      true,
    );
  });
});

describe("merge dedupe", () => {
  const targetEntry = {
    date: new Date("2026-08-21T16:00:00.000Z"),
    memo: "午饭",
    merchant: null,
    project: null,
    lines: [
      { accountId: "tgt_meals", debit: "35.50", credit: "0" },
      { accountId: "tgt_food", debit: "0", credit: "35.50" },
    ],
  };

  beforeEach(() => {
    vi.mocked(accountRepository.listByLedger).mockResolvedValue([
      {
        id: "tgt_food",
        code: "food",
        name: null,
        type: "expense",
        status: "active",
      },
      {
        id: "tgt_meals",
        code: "meals",
        name: null,
        type: "expense",
        status: "active",
      },
    ] as never);
  });

  it("skips an entry the target ledger already has", async () => {
    vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
      targetEntry,
    ] as never);
    const plan = await previewImport(USER, payload(baseDocument()), {
      mode: "merge",
      ledgerId: "tgt_led",
    });
    expect(plan.entries).toMatchObject({ importable: 0, duplicates: 1 });
  });

  it("does not confuse the same day with the same entry", async () => {
    vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
      {
        ...targetEntry,
        memo: "午饭",
        lines: [
          { accountId: "tgt_meals", debit: "20.00", credit: "0" },
          { accountId: "tgt_food", debit: "0", credit: "20.00" },
        ],
      },
    ] as never);
    const plan = await previewImport(USER, payload(baseDocument()), {
      mode: "merge",
      ledgerId: "tgt_led",
    });
    expect(plan.entries).toMatchObject({ importable: 1, duplicates: 0 });
  });

  it("fingerprint ignores line order but not amounts", () => {
    const base = {
      dayKey: "2026-08-22",
      memo: null,
      merchant: null,
      projectName: null,
      lines: [
        { accountIdentity: "code:food", debitCents: 100, creditCents: 0 },
        { accountIdentity: "code:cash", debitCents: 0, creditCents: 100 },
      ],
    };
    expect(entryFingerprint(base)).toBe(
      entryFingerprint({ ...base, lines: [...base.lines].reverse() }),
    );
    expect(entryFingerprint(base)).not.toBe(
      entryFingerprint({
        ...base,
        lines: [{ ...base.lines[0], debitCents: 101 }],
      }),
    );
  });
});

describe("import commit", () => {
  it("creates the ledger, then the accounts, then the entries", async () => {
    let counter = 0;
    vi.mocked(accountRepository.create).mockImplementation((async () => ({
      id: `acc_${++counter}`,
    })) as never);

    const result = await commitImport(USER, payload(baseDocument()), {
      mode: "new",
      ledgerName: "恢复的账本",
    });

    // The ledger is created bare — no starter accounts, because the file
    // carries every account already, renames and all.
    expect(ledgerRepository.create).toHaveBeenCalledWith(
      {
        ownerId: USER,
        name: "恢复的账本",
        description: undefined,
        currency: "CNY",
      },
      // The ledger is created inside the setup transaction: a restore that
      // fails afterwards must not leave an empty ledger behind.
      expect.anything(),
    );
    expect(ledgerMemberRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: "owner" }),
      expect.anything(),
    );
    expect(result.created.accounts).toBe(2);
    expect(result.created.entries).toBe(1);
    expect(result.ledgerId).toBe("new_led");
    expect(result.skipped).toEqual({ entries: 0 });
  });

  it("numbers an unnamed restore after the ledgers already there", async () => {
    vi.mocked(ledgerRepository.listForUser).mockResolvedValue([
      { name: "旧账本" },
    ] as never);
    await commitImport(USER, payload(baseDocument()), { mode: "new" });
    expect(ledgerRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "旧账本 (2)" }),
      expect.anything(),
    );
  });

  it("creates a parent before its child", async () => {
    const order: string[] = [];
    vi.mocked(accountRepository.create).mockImplementation((async (data: {
      name: string | null;
      code?: string | null;
    }) => {
      order.push(data.code ?? data.name ?? "?");
      return { id: `acc_${order.length}` };
    }) as never);
    await commitImport(USER, payload(baseDocument()), { mode: "new" });
    expect(order).toEqual(["food", "meals"]);
  });

  it("posts an entry with its remapped accounts and people", async () => {
    vi.mocked(accountRepository.create).mockImplementation((async () => ({
      id: `acc_${Math.random()}`,
    })) as never);
    await commitImport(USER, payload(baseDocument()), { mode: "new" });

    const call = vi.mocked(postEntryInTransaction).mock.calls[0];
    const data = call[4];
    expect(call[1]).toBe(USER);
    expect(data.date.toISOString()).toBe("2026-08-21T16:00:00.000Z");
    expect(data.rawLines.map((line) => line.debit)).toEqual([35.5, 0]);
    // Alice became a virtual member, so her participant tag survives under
    // a different userId than the source's.
    expect(data.participantUserIds).toEqual(["usr_virtual"]);
  });

  it("stages each receipt against the ledger and claims it onto the entry", async () => {
    const document = baseDocument();
    document.entries[0].attachments = [
      { file: "E000001-1.jpg", mimeType: "image/jpeg", size: 2, hash: "h" },
    ];
    const photos = new Map([["E000001-1.jpg", Buffer.from([0xff, 0xd8])]]);
    await commitImport(USER, payload(document, photos), { mode: "new" });

    expect(createAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        bizType: "qianlai:journal-entry",
        bizId: "new_led",
        uploaderId: USER,
        visibility: "private",
      }),
    );
    expect(claimEntryAttachments).toHaveBeenCalledWith(
      expect.anything(),
      USER,
      "new_led",
      "new_ent",
      ["att_new"],
    );
  });

  it("keeps at most nine receipts per entry", async () => {
    const document = baseDocument();
    document.entries[0].attachments = Array.from({ length: 12 }, (_, i) => ({
      file: `E000001-${i + 1}.jpg`,
      mimeType: "image/jpeg",
      size: 2,
      hash: `h${i}`,
    }));
    const photos = new Map(
      document.entries[0].attachments.map((a) => [
        a.file,
        Buffer.from([0xff, 0xd8]),
      ]),
    );
    const result = await commitImport(USER, payload(document, photos), {
      mode: "new",
    });
    expect(result.created.photos).toBe(9);
  });

  it("refuses to import anything a preview already called blocking", async () => {
    const document = baseDocument();
    document.accounts[0].name = null;
    document.accounts[0].code = null;
    await expect(
      commitImport(USER, payload(document), { mode: "new" }),
    ).rejects.toThrow(/没有内置编码/);
  });

  it("restores the importing user's own quick-entry chips", async () => {
    const document = baseDocument();
    document.preferences = [
      {
        scope: "ledger",
        scopeKey: "src_1",
        key: "quickEntry",
        value: { chipFields: ["account", "memo"] },
      },
    ];
    await commitImport(USER, payload(document), { mode: "new" });
    expect(preferenceRepository.upsert).toHaveBeenCalledWith(
      USER,
      "ledger",
      "new_led",
      { quickEntry: { chipFields: ["account", "memo"] } },
    );
  });

  it("drops a preference payload it cannot verify", async () => {
    const document = baseDocument();
    document.preferences = [
      {
        scope: "ledger",
        scopeKey: "src_1",
        key: "quickEntry",
        value: { chipFields: "everything" },
      },
    ];
    const result = await commitImport(USER, payload(document), { mode: "new" });
    expect(preferenceRepository.upsert).not.toHaveBeenCalled();
    expect(
      result.warnings.some((warning) => warning.includes("快速录入")),
    ).toBe(true);
  });

  it("writes the budgets the file carries, against the new ids", async () => {
    const document = baseDocument();
    document.budgets = [
      {
        kind: "year",
        year: 2026,
        month: null,
        accountKey: null,
        cents: 300000,
      },
      {
        kind: "category",
        year: 2026,
        month: null,
        accountKey: "src_acc_food",
        cents: 120000,
      },
    ];
    vi.mocked(accountRepository.create).mockImplementation((async () => ({
      id: `acc_${Math.random()}`,
    })) as never);
    await commitImport(USER, payload(document), { mode: "new" });

    expect(budgetRepository.upsertYear).toHaveBeenCalledWith(
      "new_led",
      { year: 2026, cents: 300000 },
      expect.anything(),
    );
    expect(budgetRepository.setExcludedAccountIds).toHaveBeenCalledWith(
      "new_led",
      expect.any(Array),
      expect.anything(),
    );
  });

  it("does not post an entry the preview already called a duplicate", async () => {
    // The plan counts duplicates so the preview can promise "importing this
    // twice changes nothing" — but the commit chunks the file's entries, so
    // without filtering the promise is a lie and the target ledger doubles.
    vi.mocked(accountRepository.listByLedger).mockResolvedValue([
      {
        id: "tgt_meals",
        code: "meals",
        name: null,
        type: "expense",
        status: "active",
      },
      {
        id: "tgt_food",
        code: "food",
        name: null,
        type: "expense",
        status: "active",
      },
    ] as never);
    vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
      {
        date: new Date("2026-08-21T16:00:00.000Z"),
        memo: "午饭",
        merchant: null,
        project: null,
        lines: [
          { accountId: "tgt_meals", debit: "35.50", credit: "0" },
          { accountId: "tgt_food", debit: "0", credit: "35.50" },
        ],
      },
    ] as never);

    const result = await commitImport(USER, payload(baseDocument()), {
      mode: "merge",
      ledgerId: "tgt_led",
    });

    expect(result.skipped).toEqual({ entries: 1 });
    expect(result.created.entries).toBe(0);
    expect(postEntryInTransaction).not.toHaveBeenCalled();
  });

  it("skips a row the journal rejects without losing the rest of the chunk", async () => {
    // Balanced overall but not postable: a zero-value line trips the
    // journal's per-line rule, which the preview can't see. It must cost one
    // entry, not the 200-entry transaction it shares.
    const document = baseDocument();
    document.entries = [
      { ...document.entries[0], key: "src_ent_bad" },
      { ...document.entries[0], key: "src_ent_ok" },
    ];
    document.entries[0].lines = [
      {
        accountKey: "src_acc_meals",
        debitCents: 0,
        creditCents: 0,
        memo: null,
      },
      { accountKey: "src_acc_food", debitCents: 0, creditCents: 0, memo: null },
    ];
    vi.mocked(postEntryInTransaction).mockImplementation((async (
      _tx: unknown,
      _userId: string,
      _ledgerId: string,
      _ledger: unknown,
      data: { rawLines: Array<{ debit: number; credit: number }> },
    ) => {
      if (data.rawLines[0].debit === 0 && data.rawLines[0].credit === 0) {
        throw new HTTPException(400, {
          message: "Each line must have exactly one positive amount",
        });
      }
      return { id: "new_ent" };
    }) as never);
    vi.mocked(ledgerRepository.findById).mockResolvedValue({
      id: "new_led",
      lastEntryNo: 1,
      status: "active",
    } as never);

    const result = await commitImport(USER, payload(document), { mode: "new" });

    expect(result.created.entries).toBe(1);
    expect(
      result.warnings.some((warning) =>
        warning.includes("exactly one positive"),
      ),
    ).toBe(true);
  });

  it("posts merged entries against the accounts the target already has", async () => {
    // The bug this pins: a merge's accounts are resolved to EXISTING ids,
    // not created, so nothing would put them in the write context and every
    // merged entry's lines would resolve to nothing — silently dropped.
    vi.mocked(accountRepository.listByLedger).mockResolvedValue([
      {
        id: "tgt_meals",
        code: "meals",
        name: null,
        type: "expense",
        status: "active",
        sortOrder: 0,
        flags: [],
        parentId: null,
        icon: null,
        meta: null,
        realAccountId: null,
      },
      {
        id: "tgt_food",
        code: "food",
        name: null,
        type: "expense",
        status: "active",
        sortOrder: 0,
        flags: [],
        parentId: null,
        icon: null,
        meta: null,
        realAccountId: null,
      },
    ] as never);
    vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([] as never);

    const result = await commitImport(USER, payload(baseDocument()), {
      mode: "merge",
      ledgerId: "tgt_led",
    });

    expect(result.created.accounts).toBe(0);
    expect(result.created.entries).toBe(1);
    const data = vi.mocked(postEntryInTransaction).mock.calls[0][4];
    expect(data.rawLines.map((line) => line.accountId)).toEqual([
      "tgt_meals",
      "tgt_food",
    ]);
  });

  it("leaves an archived merge target alone", async () => {
    const documentWith2 = baseDocument();
    documentWith2.entries = [];
    vi.mocked(requireLedgerAccess).mockResolvedValue({
      ledger: { id: "tgt_led", ownerId: USER, status: "archived", name: "x" },
      membership: { role: "owner" },
    } as never);
    await expect(
      commitImport(USER, payload(documentWith2), {
        mode: "merge",
        ledgerId: "tgt_led",
      }),
    ).rejects.toThrow();
  });
});

describe("preview binding", () => {
  it("is the file's own hash, so a commit can refuse a different file", () => {
    const a = previewToken(Buffer.from("file-a"));
    const b = previewToken(Buffer.from("file-b"));
    expect(a).toBe(previewToken(Buffer.from("file-a")));
    expect(a).not.toBe(b);
  });
});
