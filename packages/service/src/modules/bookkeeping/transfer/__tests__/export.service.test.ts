import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#modules/attachment/attachment.service", () => ({
  JOURNAL_ENTRY_BIZ_TYPE: "qianlai:journal-entry",
  listBizAttachments: vi.fn(),
  photoExtension: (mimeType: string) =>
    ({
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
    })[mimeType] ?? "bin",
}));

vi.mock("../../account.repository", () => ({
  accountRepository: { listByLedger: vi.fn() },
}));
vi.mock("../../budget.repository", () => ({
  budgetRepository: { listAll: vi.fn() },
}));
vi.mock("../../category-budget.repository", () => ({
  categoryBudgetRepository: { listAll: vi.fn() },
}));
vi.mock("../../journal.repository", () => ({
  journalRepository: { listEntries: vi.fn() },
}));
vi.mock("../../ledger-member.repository", () => ({
  ledgerMemberRepository: { listByLedger: vi.fn() },
}));
vi.mock("../../ledger.repository", () => ({
  ledgerRepository: { findById: vi.fn() },
}));
vi.mock("../../preference.repository", () => ({
  preferenceRepository: { listForUser: vi.fn() },
}));
vi.mock("../../project.repository", () => ({
  projectRepository: { listByLedger: vi.fn() },
}));
vi.mock("../../real-account.repository", () => ({
  realAccountRepository: { listByIds: vi.fn() },
}));

import { listBizAttachments } from "#modules/attachment/attachment.service";
import { accountRepository } from "../../account.repository";
import { budgetRepository } from "../../budget.repository";
import { categoryBudgetRepository } from "../../category-budget.repository";
import { journalRepository } from "../../journal.repository";
import { ledgerRepository } from "../../ledger.repository";
import { ledgerMemberRepository } from "../../ledger-member.repository";
import { preferenceRepository } from "../../preference.repository";
import { projectRepository } from "../../project.repository";
import { realAccountRepository } from "../../real-account.repository";
import { buildLedgerExport, rowsFromDocument } from "../export.service";

const USER = "usr_me";

function access(role: "owner" | "editor") {
  return {
    ledger: {
      id: "led_1",
      ownerId: "usr_owner",
      status: "active",
      name: "家庭账本",
    },
    membership: { role },
  };
}

const ledgerRow = {
  id: "led_1",
  name: "家庭账本",
  description: "和 Alice 一起",
  currency: "CNY",
  status: "active",
  isDefault: true,
  budgetExcludedAccountIds: ["acc_insurance"],
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

const accounts = [
  {
    id: "acc_food",
    name: null,
    code: "food",
    type: "expense",
    sortOrder: 200,
    parentId: null,
    status: "active",
    icon: "🍜",
    flags: [],
    meta: null,
    realAccountId: "real_1",
  },
  {
    id: "acc_meals",
    name: "午饭",
    code: "meals",
    type: "expense",
    sortOrder: 201,
    parentId: "acc_food",
    status: "active",
    icon: "🍚",
    flags: [],
    meta: { note: "工作日" },
    realAccountId: null,
  },
];

const entry = {
  id: "ent_1",
  ledgerId: "led_1",
  entryNo: 7,
  date: new Date("2026-08-21T16:00:00.000Z"), // 2026-08-22 in UTC+8
  memo: "午饭",
  merchant: "星巴克",
  status: "posted",
  createdById: "usr_me",
  paidById: "usr_alice",
  projectId: null,
  countsInLedger: true,
  guestCreated: false,
  excludedFromBudget: false,
  address: "朝阳区",
  addressName: "三里屯",
  latitude: { toString: () => "39.983425" },
  longitude: { toString: () => "116.322083" },
  createdAt: new Date("2026-08-21T16:05:00.000Z"),
  lines: [
    {
      accountId: "acc_meals",
      debit: { toString: () => "35.5" },
      credit: { toString: () => "0" },
      memo: null,
    },
    {
      accountId: "acc_food",
      debit: { toString: () => "0" },
      credit: { toString: () => "35.5" },
      memo: null,
    },
  ],
  participants: [
    {
      userId: "usr_alice",
      user: { id: "usr_alice", name: "Alice", email: "alice@example.com" },
    },
  ],
  createdBy: { id: "usr_me", name: "我" },
  paidBy: { id: "usr_alice", name: "Alice" },
  project: null,
};

const members = [
  {
    userId: "usr_me",
    role: "owner",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    user: {
      id: "usr_me",
      name: "我",
      email: "me@example.com",
      flags: [],
    },
  },
  {
    userId: "usr_alice",
    role: "editor",
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    user: {
      id: "usr_alice",
      name: "Alice",
      email: "alice@example.com",
      flags: [],
    },
  },
];

const attachments = [
  {
    id: "att_1",
    bizId: "ent_1",
    createdAt: new Date("2026-08-21T16:04:00.000Z"),
    upload: {
      path: "private/ab/cd/hash.jpg",
      mimeType: "image/jpeg",
      size: 2048,
      hash: "hash1",
    },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ledgerRepository.findById).mockResolvedValue(ledgerRow as never);
  vi.mocked(accountRepository.listByLedger).mockResolvedValue(
    accounts as never,
  );
  vi.mocked(projectRepository.listByLedger).mockResolvedValue([] as never);
  vi.mocked(ledgerMemberRepository.listByLedger).mockResolvedValue(
    members as never,
  );
  vi.mocked(budgetRepository.listAll).mockResolvedValue([
    {
      id: "by_1",
      year: 2026,
      cents: 300000,
      months: [{ id: "mo_1", month: 12, cents: 500000 }],
    },
  ] as never);
  vi.mocked(categoryBudgetRepository.listAll).mockResolvedValue([
    {
      id: "cb_1",
      ledgerId: "led_1",
      accountId: "acc_food",
      year: 2026,
      cents: 120000,
    },
  ] as never);
  vi.mocked(preferenceRepository.listForUser).mockResolvedValue([
    {
      scopeType: "ledger",
      scopeId: "led_1",
      data: { quickEntry: { chipFields: ["account", "memo"] } },
    },
    { scopeType: "user", scopeId: "", data: { tabs: ["journal"] } },
  ] as never);
  vi.mocked(realAccountRepository.listByIds).mockResolvedValue([
    {
      id: "real_1",
      name: "招行卡",
      type: "asset",
      status: "active",
      icon: null,
      meta: null,
    },
  ] as never);
  vi.mocked(journalRepository.listEntries).mockResolvedValue([entry] as never);
  vi.mocked(listBizAttachments).mockResolvedValue(attachments as never);
});

describe("ledger export document", () => {
  it("carries the ledger's own columns the guard's row doesn't", async () => {
    const result = await buildLedgerExport(USER, access("owner"), {
      tzOffsetMinutes: 480,
      includePhotos: false,
    });
    expect(result.document.ledger.description).toBe("和 Alice 一起");
    expect(result.document.ledger.isDefault).toBe(true);
    expect(result.document.budgetExcludedAccountKeys).toEqual([
      "acc_insurance",
    ]);
    expect(result.document.formatVersion).toBe(1);
  });

  it("keeps instants exact and derives the day from the client's offset", async () => {
    const result = await buildLedgerExport(USER, access("owner"), {
      tzOffsetMinutes: 480,
      includePhotos: false,
    });
    expect(result.document.entries[0].date).toBe("2026-08-21T16:00:00.000Z");
    const row = result.rows.entries[0];
    expect(row.day).toBe("2026-08-22");
    expect(row.amountCents).toBe(3550);
    expect(row.kind).toBe("expense");
  });

  it("shows an owner the members' emails and an editor only their names", async () => {
    const asOwner = await buildLedgerExport(USER, access("owner"), {
      tzOffsetMinutes: 480,
      includePhotos: false,
    });
    const asEditor = await buildLedgerExport(USER, access("editor"), {
      tzOffsetMinutes: 480,
      includePhotos: false,
    });

    expect(
      asOwner.document.members.find((m) => m.key === "usr_alice")?.email,
    ).toBe("alice@example.com");
    // The roster's own rule, applied here because the export reads the
    // repository directly and never passes the journal service's redact.
    expect(
      asEditor.document.members.find((m) => m.key === "usr_alice")?.email,
    ).toBeNull();
    expect(asEditor.document.entries[0].participants[0].email).toBeNull();
    expect(asEditor.rows.entries[0].participants).toEqual(["Alice"]);
    expect(asOwner.rows.entries[0].participants).toEqual([
      "Alice<alice@example.com>",
    ]);
  });

  it("names receipts by entry number and only streams them when asked", async () => {
    const withPhotos = await buildLedgerExport(USER, access("owner"), {
      tzOffsetMinutes: 480,
      includePhotos: true,
    });
    expect(withPhotos.document.entries[0].attachments[0].file).toBe(
      "E000007-1.jpg",
    );
    expect(withPhotos.photoFiles).toEqual([
      { entryName: "photos/E000007-1.jpg", path: "private/ab/cd/hash.jpg" },
    ]);
    expect(withPhotos.photoCount).toBe(1);

    const withoutPhotos = await buildLedgerExport(USER, access("owner"), {
      tzOffsetMinutes: 480,
      includePhotos: false,
    });
    // The document still lists them (the archive format always does), but
    // nothing is read off disk for an xlsx-only export.
    expect(withoutPhotos.document.entries[0].attachments).toHaveLength(1);
    expect(withoutPhotos.photoFiles).toEqual([]);
  });

  it("exports the whole ledger, including the entries users opted out of", async () => {
    await buildLedgerExport(USER, access("owner"), {
      tzOffsetMinutes: 0,
      includePhotos: false,
    });
    expect(vi.mocked(journalRepository.listEntries)).toHaveBeenCalledWith(
      "led_1",
      expect.objectContaining({
        includeExcluded: true,
        includeBudgetExcluded: true,
        order: "asc",
      }),
    );
  });

  it("carries the budgets, the real accounts and the ledger preferences", async () => {
    const result = await buildLedgerExport(USER, access("owner"), {
      tzOffsetMinutes: 480,
      includePhotos: false,
    });
    expect(result.document.budgets).toEqual([
      {
        kind: "year",
        year: 2026,
        month: null,
        accountKey: null,
        cents: 300000,
      },
      { kind: "month", year: 2026, month: 12, accountKey: null, cents: 500000 },
      {
        kind: "category",
        year: 2026,
        month: null,
        accountKey: "acc_food",
        cents: 120000,
      },
    ]);
    expect(result.document.realAccounts).toHaveLength(1);
    // The app-level tab layout is device setup, not ledger data.
    expect(result.document.preferences).toEqual([
      {
        scope: "ledger",
        scopeKey: "led_1",
        key: "quickEntry",
        value: { chipFields: ["account", "memo"] },
      },
    ]);
  });

  it("pages through a ledger bigger than one query's worth", async () => {
    const page = Array.from({ length: 500 }, (_, index) => ({
      ...entry,
      id: `ent_${index}`,
      entryNo: index + 1,
    }));
    vi.mocked(journalRepository.listEntries)
      .mockResolvedValueOnce(page as never)
      .mockResolvedValueOnce([] as never);

    const result = await buildLedgerExport(USER, access("owner"), {
      tzOffsetMinutes: 480,
      includePhotos: false,
    });
    expect(result.entryCount).toBe(500);
    expect(vi.mocked(journalRepository.listEntries)).toHaveBeenCalledTimes(2);
  });
});

describe("workbook rows", () => {
  it("splits an entry's lines into their own sheet", async () => {
    const result = await buildLedgerExport(USER, access("owner"), {
      tzOffsetMinutes: 480,
      includePhotos: false,
    });
    expect(result.rows.entryLines).toHaveLength(2);
    expect(result.rows.entryLines[0]).toMatchObject({
      entryKey: "ent_1",
      lineNo: 1,
      accountKey: "acc_meals",
      debitCents: 3550,
    });
  });

  it("counts entries and photos on the ledger row", async () => {
    const result = await buildLedgerExport(USER, access("owner"), {
      tzOffsetMinutes: 480,
      includePhotos: true,
    });
    const ledgerRowOut = result.rows.ledger[0];
    expect(ledgerRowOut.entryCount).toBe(1);
    // Read off the document, not off what was streamed, so an xlsx-only
    // export reports the same numbers.
    expect(ledgerRowOut.photoCount).toBe(1);
  });

  it("is a pure function of the document", async () => {
    const result = await buildLedgerExport(USER, access("owner"), {
      tzOffsetMinutes: 480,
      includePhotos: false,
    });
    expect(rowsFromDocument(result.document)).toEqual(result.rows);
  });
});
