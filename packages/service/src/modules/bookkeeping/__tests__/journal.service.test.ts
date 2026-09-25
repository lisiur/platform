import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookAccount } from "#generated/prisma/client";

vi.mock("#lib/db", () => ({
  prisma: {
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})),
    attachment: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    upload: { delete: vi.fn() },
  },
}));

// The attachment storage service (claim/delete helpers) is faked so tests
// assert the journal service's calls into it, not its internals.
vi.mock("#modules/attachment/attachment.service", () => ({
  deleteAttachmentsByIds: vi.fn(),
  deleteAttachmentsByBiz: vi.fn(),
  JOURNAL_ENTRY_BIZ_TYPE: "qianlai:journal-entry",
}));

vi.mock("../ledger.repository", () => ({
  ledgerRepository: {
    findById: vi.fn(),
    update: vi.fn(),
  },
  lockLedgerRow: vi.fn(),
}));

vi.mock("../ledger-member.repository", () => ({
  ledgerMemberRepository: {
    listByLedger: vi.fn(),
  },
}));

vi.mock("../account.repository", () => ({
  accountRepository: {
    listByLedger: vi.fn(),
  },
}));

// Partial mock: the real `isLedgerActivityEntry` stays live so the
// listEntries gate below exercises the actual activity twin, not a copy.
vi.mock("../journal.repository", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  journalRepository: {
    createEntry: vi.fn(),
    findById: vi.fn(),
    updateEntry: vi.fn(),
    delete: vi.fn(),
    listEntries: vi.fn(),
    countEntries: vi.fn(),
  },
}));

vi.mock("../project.repository", () => ({
  projectRepository: {
    findById: vi.fn(),
    findByIdWithMembers: vi.fn(),
  },
}));

vi.mock("../project-member.repository", () => ({
  projectMemberRepository: {
    findMembership: vi.fn(),
    listUserIdsByProject: vi.fn(),
  },
}));

import { prisma } from "#lib/db";
import {
  deleteAttachmentsByBiz,
  deleteAttachmentsByIds,
} from "#modules/attachment/attachment.service";
import { accountRepository } from "../account.repository";
import { journalRepository } from "../journal.repository";
import {
  createEntry,
  deleteEntry,
  listEntries,
  updateEntry,
  validateJournalLines,
} from "../journal.service";
import { ledgerRepository } from "../ledger.repository";
import { ledgerMemberRepository } from "../ledger-member.repository";
import { projectRepository } from "../project.repository";
import { projectMemberRepository } from "../project-member.repository";
import {
  journalLineSchema,
  serializeEntry,
} from "../routes/journal-entry/schema";

const mockPrisma = prisma as unknown as {
  $transaction: ReturnType<typeof vi.fn>;
  attachment: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
};

/**
 * Every entry write now reads/claims photo receipts inside its transaction;
 * the fake tx is the shared mock prisma so the attachment model is reachable
 * through both. Attachment reads default to "no receipts" unless a test
 * seeds rows (resetAllMocks clears the default each time).
 */
function seedTransaction() {
  mockPrisma.$transaction.mockImplementation(
    (fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma),
  );
  mockPrisma.attachment.findMany.mockResolvedValue([]);
}

const mockDeleteAttachmentsByIds =
  deleteAttachmentsByIds as unknown as ReturnType<typeof vi.fn>;
const mockDeleteAttachmentsByBiz =
  deleteAttachmentsByBiz as unknown as ReturnType<typeof vi.fn>;
const mockLedgerRepo = ledgerRepository as unknown as {
  findById: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};
const mockAccountRepo = accountRepository as unknown as {
  listByLedger: ReturnType<typeof vi.fn>;
};
const mockMemberRepo = ledgerMemberRepository as unknown as {
  listByLedger: ReturnType<typeof vi.fn>;
};
const mockJournalRepo = journalRepository as unknown as {
  createEntry: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  updateEntry: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  listEntries: ReturnType<typeof vi.fn>;
  countEntries: ReturnType<typeof vi.fn>;
};

function account(overrides: Partial<BookAccount> = {}): BookAccount {
  return {
    id: "acc-1",
    ledgerId: "led-1",
    name: "Cash",
    type: "asset",
    sortOrder: 10,
    parentId: null,
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as BookAccount;
}

async function expectStatus(fn: () => unknown, status: number): Promise<void> {
  let err: unknown;
  try {
    await fn();
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(HTTPException);
  expect((err as HTTPException).status).toBe(status);
}

describe("validateJournalLines", () => {
  const cash = account({ id: "acc-cash" });
  const food = account({
    id: "acc-food",
    name: "Food",
    type: "expense",
  });

  it("accepts a balanced two-line entry", () => {
    expect(() =>
      validateJournalLines(
        [
          { accountId: "acc-cash", debit: 0, credit: 50 },
          { accountId: "acc-food", debit: 50, credit: 0 },
        ],
        [cash, food],
      ),
    ).not.toThrow();
  });

  it("resolves a null credit accountId to the defaultCredit pocket", () => {
    const pocket = account({
      id: "acc-default",
      code: "defaultAccount",
      flags: ["defaultDebit", "defaultCredit"],
    });
    const lines = validateJournalLines(
      [
        { accountId: null, debit: 0, credit: 50 },
        { accountId: "acc-food", debit: 50, credit: 0 },
      ],
      [pocket, food],
    );
    expect(lines[0].accountId).toBe("acc-default");
  });

  it("resolves a null debit accountId to the defaultDebit pocket", () => {
    const pocket = account({
      id: "acc-default",
      code: "defaultAccount",
      flags: ["defaultDebit", "defaultCredit"],
    });
    const income = account({
      id: "acc-income",
      name: "Salary",
      type: "income",
    });
    const lines = validateJournalLines(
      [
        { accountId: undefined, debit: 30, credit: 0 },
        { accountId: "acc-income", debit: 0, credit: 30 },
      ],
      [pocket, income],
    );
    expect(lines[0].accountId).toBe("acc-default");
  });

  it("rejects an unselected side when no default pocket is seeded (400)", async () => {
    await expectStatus(
      () =>
        validateJournalLines(
          [
            { accountId: null, debit: 0, credit: 50 },
            { accountId: "acc-food", debit: 50, credit: 0 },
          ],
          [cash, food],
        ),
      400,
    );
  });

  it("rejects fewer than two lines (400)", async () => {
    await expectStatus(
      () =>
        validateJournalLines(
          [{ accountId: "acc-cash", debit: 0, credit: 50 }],
          [cash, food],
        ),
      400,
    );
  });

  it("rejects a line with amounts on both sides (400)", async () => {
    await expectStatus(
      () =>
        validateJournalLines(
          [
            { accountId: "acc-cash", debit: 10, credit: 10 },
            { accountId: "acc-food", debit: 20, credit: 0 },
          ],
          [cash, food],
        ),
      400,
    );
  });

  it("rejects a line with no amount at all (400)", async () => {
    await expectStatus(
      () =>
        validateJournalLines(
          [
            { accountId: "acc-cash", debit: 0, credit: 0 },
            { accountId: "acc-food", debit: 20, credit: 0 },
          ],
          [cash, food],
        ),
      400,
    );
  });

  it("rejects unbalanced entries (400)", async () => {
    await expectStatus(
      () =>
        validateJournalLines(
          [
            { accountId: "acc-cash", debit: 0, credit: 50 },
            { accountId: "acc-food", debit: 49, credit: 0 },
          ],
          [cash, food],
        ),
      400,
    );
  });

  it("rejects accounts from another ledger (400)", async () => {
    await expectStatus(
      () =>
        validateJournalLines(
          [
            { accountId: "acc-cash", debit: 0, credit: 50 },
            { accountId: "acc-foreign", debit: 50, credit: 0 },
          ],
          [cash, food],
        ),
      400,
    );
  });

  it("rejects archived accounts (400)", async () => {
    const archived = account({ id: "acc-food", status: "archived" });
    await expectStatus(
      () =>
        validateJournalLines(
          [
            { accountId: "acc-cash", debit: 0, credit: 50 },
            { accountId: "acc-food", debit: 50, credit: 0 },
          ],
          [cash, archived],
        ),
      400,
    );
  });

  it("tolerates sub-cent rounding differences when balancing", () => {
    expect(() =>
      validateJournalLines(
        [
          { accountId: "acc-cash", debit: 0, credit: 33.333 },
          { accountId: "acc-food", debit: 33.333, credit: 0 },
        ],
        [cash, food],
      ),
    ).not.toThrow();
  });

  it("rejects sub-cent amounts that round to zero on their positive side (400)", async () => {
    // 10 x 0.0009 debits vs 0.009 credit sums to zero raw, but each debit
    // line would store as 0.00 — validation must happen on stored cents.
    const lines = [
      ...Array.from({ length: 10 }, () => ({
        accountId: "acc-food",
        debit: 0.0009,
        credit: 0,
      })),
      { accountId: "acc-cash", debit: 0, credit: 0.009 },
    ];
    await expectStatus(() => validateJournalLines(lines, [cash, food]), 400);
  });

  it("balances on rounded cent amounts, not raw floats", () => {
    // Raw sums differ (0.015 vs 0.010) but stored cents balance (2c vs 1c+1c).
    expect(() =>
      validateJournalLines(
        [
          { accountId: "acc-food", debit: 0.015, credit: 0 },
          { accountId: "acc-cash", debit: 0, credit: 0.005 },
          { accountId: "acc-cash", debit: 0, credit: 0.005 },
        ],
        [cash, food],
      ),
    ).not.toThrow();
  });

  it("rejects amounts above the DECIMAL(12,2) ceiling (400)", async () => {
    // 9,999,999,999.99 is the storable max; beyond it the INSERT would
    // overflow numerically and surface as a 500 instead of a validation error.
    await expectStatus(
      () =>
        validateJournalLines(
          [
            { accountId: "acc-cash", debit: 0, credit: 10_000_000_000 },
            { accountId: "acc-food", debit: 10_000_000_000, credit: 0 },
          ],
          [cash, food],
        ),
      400,
    );
  });

  it("accepts amounts exactly at the DECIMAL(12,2) ceiling", () => {
    expect(() =>
      validateJournalLines(
        [
          { accountId: "acc-cash", debit: 0, credit: 9_999_999_999.99 },
          { accountId: "acc-food", debit: 9_999_999_999.99, credit: 0 },
        ],
        [cash, food],
      ),
    ).not.toThrow();
  });

  it("returns the normalized lines in integer cents", () => {
    const normalized = validateJournalLines(
      [
        { accountId: "acc-cash", debit: 0, credit: 33.333 },
        { accountId: "acc-food", debit: 33.333, credit: 0, memo: "lunch" },
      ],
      [cash, food],
    );
    expect(normalized).toEqual([
      { accountId: "acc-cash", debitCents: 0, creditCents: 3333 },
      {
        accountId: "acc-food",
        debitCents: 3333,
        creditCents: 0,
        memo: "lunch",
      },
    ]);
  });
});

const baseEntryInput = {
  date: new Date("2026-08-01T00:00:00Z"),
  memo: "groceries",
  lines: [
    { accountId: "acc-cash", debit: 0, credit: 50 },
    { accountId: "acc-food", debit: 50, credit: 0 },
  ],
};

const editorAccess = {
  ledger: { id: "led-1", ownerId: "user-a", status: "active", name: "L" },
  membership: { role: "editor" as const },
};

const guestAccess = {
  ledger: { id: "led-1", ownerId: "user-owner", status: "active", name: "L" },
  membership: { role: "guest" as const },
};

const ownerActor = { userId: "user-a", role: "owner" as const };
const guestActor = { userId: "user-b", role: "guest" as const };

const mockProjectRepo = projectRepository as unknown as {
  findById: ReturnType<typeof vi.fn>;
  findByIdWithMembers: ReturnType<typeof vi.fn>;
};
const mockProjectMemberRepo = projectMemberRepository as unknown as {
  findMembership: ReturnType<typeof vi.fn>;
  listUserIdsByProject: ReturnType<typeof vi.fn>;
};

describe("createEntry", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    seedTransaction();
    mockMemberRepo.listByLedger.mockResolvedValue([
      { id: "mem-1", userId: "user-a" },
      { id: "mem-2", userId: "user-b" },
    ]);
    mockProjectMemberRepo.listUserIdsByProject.mockResolvedValue([]);
  });

  it("rejects a ledger archived after the route's check (race, 400)", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "archived",
    });
    await expectStatus(
      () => createEntry("user-a", "led-1", baseEntryInput, editorAccess),
      400,
    );
    expect(mockJournalRepo.createEntry).not.toHaveBeenCalled();
  });

  it("returns 404 when the ledger no longer exists", async () => {
    mockLedgerRepo.findById.mockResolvedValue(null);
    await expectStatus(
      () => createEntry("user-a", "led-1", baseEntryInput, editorAccess),
      404,
    );
  });

  it("posts when the ledger is still active under the lock", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "active",
      lastEntryNo: 3,
    });
    mockAccountRepo.listByLedger.mockResolvedValue([
      account({ id: "acc-cash" }),
      account({ id: "acc-food", name: "Food", type: "expense" }),
    ]);
    const created = { id: "e-1" };
    mockJournalRepo.createEntry.mockResolvedValue(created);
    const result = await createEntry(
      "user-a",
      "led-1",
      baseEntryInput,
      editorAccess,
    );
    // The posted entry comes back wrapped with its (empty) receipt echo —
    // every entry read shape carries `attachments`.
    expect(result).toEqual({ ...created, attachments: [] });
    expect(mockLedgerRepo.update).toHaveBeenCalledWith(
      "led-1",
      { lastEntryNo: 4 },
      expect.anything(),
    );
    expect(mockJournalRepo.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ ledgerId: "led-1", entryNo: 4 }),
      expect.anything(),
    );
  });

  it("never reuses an entry number after the highest entry is deleted", async () => {
    // lastEntryNo stays at 3 even if the entry numbered 3 no longer exists.
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "active",
      lastEntryNo: 3,
    });
    mockAccountRepo.listByLedger.mockResolvedValue([
      account({ id: "acc-cash" }),
      account({ id: "acc-food", name: "Food", type: "expense" }),
    ]);
    mockJournalRepo.createEntry.mockResolvedValue({ id: "e-2" });
    await createEntry("user-a", "led-1", baseEntryInput, editorAccess);
    expect(mockJournalRepo.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ entryNo: 4 }),
      expect.anything(),
    );
  });

  it("rejects participants that are not members of the ledger (400)", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "active",
      lastEntryNo: 0,
    });
    mockAccountRepo.listByLedger.mockResolvedValue([
      account({ id: "acc-cash" }),
      account({ id: "acc-food", name: "Food", type: "expense" }),
    ]);
    await expectStatus(
      () =>
        createEntry(
          "user-a",
          "led-1",
          {
            ...baseEntryInput,
            participantUserIds: ["user-a", "user-foreign"],
          },
          editorAccess,
        ),
      400,
    );
    expect(mockJournalRepo.createEntry).not.toHaveBeenCalled();
  });

  it("dedupes participant ids and passes them through to the repository", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "active",
      lastEntryNo: 0,
    });
    mockAccountRepo.listByLedger.mockResolvedValue([
      account({ id: "acc-cash" }),
      account({ id: "acc-food", name: "Food", type: "expense" }),
    ]);
    mockJournalRepo.createEntry.mockResolvedValue({ id: "e-3" });
    await createEntry(
      "user-a",
      "led-1",
      {
        ...baseEntryInput,
        participantUserIds: ["user-b", "user-a", "user-b"],
      },
      editorAccess,
    );
    expect(mockJournalRepo.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ participantUserIds: ["user-b", "user-a"] }),
      expect.anything(),
    );
  });

  it("omits participants entirely when none are given", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "active",
      lastEntryNo: 0,
    });
    mockAccountRepo.listByLedger.mockResolvedValue([
      account({ id: "acc-cash" }),
      account({ id: "acc-food", name: "Food", type: "expense" }),
    ]);
    mockJournalRepo.createEntry.mockResolvedValue({ id: "e-4" });
    await createEntry("user-a", "led-1", baseEntryInput, editorAccess);
    expect(mockJournalRepo.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ participantUserIds: undefined }),
      expect.anything(),
    );
  });

  it("auto-tags the project's current members when a project entry has no participants", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "active",
      lastEntryNo: 0,
    });
    mockAccountRepo.listByLedger.mockResolvedValue([
      account({ id: "acc-cash" }),
      account({ id: "acc-food", name: "Food", type: "expense" }),
    ]);
    mockMemberRepo.listByLedger.mockResolvedValue([
      { id: "mem-2", userId: "user-b" },
      { id: "mem-1", userId: "user-a" },
    ]);
    mockProjectRepo.findById.mockResolvedValue({
      id: "proj-1",
      ledgerId: "led-1",
      status: "active",
    });
    mockProjectRepo.findByIdWithMembers.mockResolvedValue({
      id: "proj-1",
      // "user-out" is a project outsider (no ledger row) — their share of
      // the entry is real consumption, tagged like anyone else.
      members: [
        { userId: "user-b" },
        { userId: "user-a" },
        { userId: "user-out" },
      ],
    });
    mockProjectMemberRepo.listUserIdsByProject.mockResolvedValue([
      { userId: "user-a" },
      { userId: "user-b" },
      { userId: "user-out" },
    ]);
    mockJournalRepo.createEntry.mockResolvedValue({ id: "e-6" });
    await createEntry(
      "user-a",
      "led-1",
      { ...baseEntryInput, projectId: "proj-1" },
      editorAccess,
    );
    // Sorted userIds, one per project member — the split set is frozen
    // by userId (not ledgerMemberId), so it survives membership changes
    // and includes project outsiders.
    expect(mockJournalRepo.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        participantUserIds: ["user-a", "user-b", "user-out"],
      }),
      expect.anything(),
    );
  });

  it("keeps explicit participants on a project entry untouched", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "active",
      lastEntryNo: 0,
    });
    mockAccountRepo.listByLedger.mockResolvedValue([
      account({ id: "acc-cash" }),
      account({ id: "acc-food", name: "Food", type: "expense" }),
    ]);
    mockMemberRepo.listByLedger.mockResolvedValue([
      { id: "mem-1", userId: "user-a" },
      { id: "mem-2", userId: "user-b" },
    ]);
    mockProjectRepo.findById.mockResolvedValue({
      id: "proj-1",
      ledgerId: "led-1",
      status: "active",
    });
    mockJournalRepo.createEntry.mockResolvedValue({ id: "e-7" });
    await createEntry(
      "user-a",
      "led-1",
      {
        ...baseEntryInput,
        projectId: "proj-1",
        participantUserIds: ["user-b"],
      },
      editorAccess,
    );
    expect(mockProjectRepo.findByIdWithMembers).not.toHaveBeenCalled();
    expect(mockJournalRepo.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ participantUserIds: ["user-b"] }),
      expect.anything(),
    );
  });

  it("defaults countsInLedger to true and passes an explicit opt-out through", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "active",
      lastEntryNo: 0,
    });
    mockAccountRepo.listByLedger.mockResolvedValue([
      account({ id: "acc-cash" }),
      account({ id: "acc-food", name: "Food", type: "expense" }),
    ]);
    mockJournalRepo.createEntry.mockResolvedValue({ id: "e-5" });
    await createEntry("user-a", "led-1", baseEntryInput, editorAccess);
    expect(mockJournalRepo.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ countsInLedger: true, guestCreated: false }),
      expect.anything(),
    );

    await createEntry(
      "user-a",
      "led-1",
      {
        ...baseEntryInput,
        countsInLedger: false,
      },
      editorAccess,
    );
    expect(mockJournalRepo.createEntry).toHaveBeenLastCalledWith(
      expect.objectContaining({ countsInLedger: false }),
      expect.anything(),
    );
  });

  it("defaults excludedFromBudget to false and passes the client's intent through", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "active",
      lastEntryNo: 0,
    });
    mockAccountRepo.listByLedger.mockResolvedValue([
      account({ id: "acc-cash" }),
      account({ id: "acc-food", name: "Food", type: "expense" }),
    ]);
    mockJournalRepo.createEntry.mockResolvedValue({ id: "e-8" });
    await createEntry("user-a", "led-1", baseEntryInput, editorAccess);
    expect(mockJournalRepo.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ excludedFromBudget: false }),
      expect.anything(),
    );

    // The client resolves the default from the ledger's excluded categories
    // and posts the final result; the server never re-derives it.
    await createEntry(
      "user-a",
      "led-1",
      { ...baseEntryInput, excludedFromBudget: true },
      editorAccess,
    );
    expect(mockJournalRepo.createEntry).toHaveBeenLastCalledWith(
      expect.objectContaining({ excludedFromBudget: true }),
      expect.anything(),
    );
  });
});

describe("updateEntry", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    seedTransaction();
    mockMemberRepo.listByLedger.mockResolvedValue([
      { id: "mem-1", userId: "user-a" },
      { id: "mem-2", userId: "user-b" },
    ]);
    mockProjectMemberRepo.listUserIdsByProject.mockResolvedValue([]);
  });

  it("returns 404 when the entry belongs to another ledger", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "active",
    });
    mockJournalRepo.findById.mockResolvedValue({
      id: "e-1",
      ledgerId: "led-other",
    });
    await expectStatus(
      () => updateEntry("led-1", "e-1", ownerActor, baseEntryInput),
      404,
    );
    expect(mockJournalRepo.updateEntry).not.toHaveBeenCalled();
  });

  it("rejects a ledger archived after the route's check (race, 400)", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "archived",
    });
    mockJournalRepo.findById.mockResolvedValue({
      id: "e-1",
      ledgerId: "led-1",
    });
    await expectStatus(
      () => updateEntry("led-1", "e-1", ownerActor, baseEntryInput),
      400,
    );
    expect(mockJournalRepo.updateEntry).not.toHaveBeenCalled();
  });

  it("replaces the entry and clears participants when none are given", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "active",
    });
    mockJournalRepo.findById.mockResolvedValue({
      id: "e-1",
      ledgerId: "led-1",
    });
    mockAccountRepo.listByLedger.mockResolvedValue([
      account({ id: "acc-cash" }),
      account({ id: "acc-food", name: "Food", type: "expense" }),
    ]);
    mockJournalRepo.updateEntry.mockResolvedValue({ id: "e-1" });
    const updated = await updateEntry("led-1", "e-1", ownerActor, {
      ...baseEntryInput,
      memo: "edited",
    });
    expect(updated).toEqual({ id: "e-1", attachments: [] });
    expect(mockJournalRepo.updateEntry).toHaveBeenCalledWith(
      "e-1",
      expect.objectContaining({
        memo: "edited",
        participantUserIds: [],
        lines: [
          expect.objectContaining({ accountId: "acc-cash" }),
          expect.objectContaining({ accountId: "acc-food" }),
        ],
      }),
      expect.anything(),
    );
  });

  it("re-tags a project entry with its current members when an edit clears participants", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "active",
    });
    mockJournalRepo.findById.mockResolvedValue({
      id: "e-1",
      ledgerId: "led-1",
    });
    mockAccountRepo.listByLedger.mockResolvedValue([
      account({ id: "acc-cash" }),
      account({ id: "acc-food", name: "Food", type: "expense" }),
    ]);
    mockMemberRepo.listByLedger.mockResolvedValue([
      { id: "mem-1", userId: "user-a" },
      { id: "mem-2", userId: "user-b" },
    ]);
    mockProjectRepo.findById.mockResolvedValue({
      id: "proj-1",
      ledgerId: "led-1",
      status: "active",
    });
    mockProjectRepo.findByIdWithMembers.mockResolvedValue({
      id: "proj-1",
      members: [{ userId: "user-b" }],
    });
    mockJournalRepo.updateEntry.mockResolvedValue({ id: "e-1" });
    await updateEntry("led-1", "e-1", ownerActor, {
      ...baseEntryInput,
      projectId: "proj-1",
    });
    // user-a left the project, so only their replacement owes: the edit
    // must not fall back to "untagged = current members at read time".
    expect(mockJournalRepo.updateEntry).toHaveBeenCalledWith(
      "e-1",
      expect.objectContaining({ participantUserIds: ["user-b"] }),
      expect.anything(),
    );
  });

  it("does not touch lastEntryNo or create a new entry number", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "active",
      lastEntryNo: 7,
    });
    mockJournalRepo.findById.mockResolvedValue({
      id: "e-1",
      ledgerId: "led-1",
    });
    mockAccountRepo.listByLedger.mockResolvedValue([
      account({ id: "acc-cash" }),
      account({ id: "acc-food", name: "Food", type: "expense" }),
    ]);
    mockJournalRepo.updateEntry.mockResolvedValue({ id: "e-1" });
    await updateEntry("led-1", "e-1", ownerActor, baseEntryInput);
    expect(mockLedgerRepo.update).not.toHaveBeenCalled();
    expect(mockJournalRepo.createEntry).not.toHaveBeenCalled();
  });

  it("rejects participants that are not members of the ledger (400)", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "active",
    });
    mockJournalRepo.findById.mockResolvedValue({
      id: "e-1",
      ledgerId: "led-1",
    });
    mockAccountRepo.listByLedger.mockResolvedValue([
      account({ id: "acc-cash" }),
      account({ id: "acc-food", name: "Food", type: "expense" }),
    ]);
    await expectStatus(
      () =>
        updateEntry("led-1", "e-1", ownerActor, {
          ...baseEntryInput,
          participantUserIds: ["user-foreign"],
        }),
      400,
    );
    expect(mockJournalRepo.updateEntry).not.toHaveBeenCalled();
  });

  it("keeps the current countsInLedger when omitted and honors an explicit toggle", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "active",
    });
    mockJournalRepo.findById.mockResolvedValue({
      id: "e-1",
      ledgerId: "led-1",
      countsInLedger: false,
    });
    mockAccountRepo.listByLedger.mockResolvedValue([
      account({ id: "acc-cash" }),
      account({ id: "acc-food", name: "Food", type: "expense" }),
    ]);
    mockJournalRepo.updateEntry.mockResolvedValue({ id: "e-1" });

    // Omitted: an excluded entry stays excluded across an edit.
    await updateEntry("led-1", "e-1", ownerActor, baseEntryInput);
    expect(mockJournalRepo.updateEntry).toHaveBeenCalledWith(
      "e-1",
      expect.objectContaining({ countsInLedger: false }),
      expect.anything(),
    );

    // Explicit toggle flips it.
    await updateEntry("led-1", "e-1", ownerActor, {
      ...baseEntryInput,
      countsInLedger: true,
    });
    expect(mockJournalRepo.updateEntry).toHaveBeenLastCalledWith(
      "e-1",
      expect.objectContaining({ countsInLedger: true }),
      expect.anything(),
    );
  });

  it("keeps the current excludedFromBudget when omitted and honors an explicit toggle", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "active",
    });
    mockJournalRepo.findById.mockResolvedValue({
      id: "e-1",
      ledgerId: "led-1",
      countsInLedger: true,
      excludedFromBudget: true,
    });
    mockAccountRepo.listByLedger.mockResolvedValue([
      account({ id: "acc-cash" }),
      account({ id: "acc-food", name: "Food", type: "expense" }),
    ]);
    mockJournalRepo.updateEntry.mockResolvedValue({ id: "e-1" });

    // Omitted: an excluded entry (e.g. insurance) stays excluded across an
    // edit that doesn't surface the budget toggle.
    await updateEntry("led-1", "e-1", ownerActor, baseEntryInput);
    expect(mockJournalRepo.updateEntry).toHaveBeenCalledWith(
      "e-1",
      expect.objectContaining({ excludedFromBudget: true }),
      expect.anything(),
    );

    await updateEntry("led-1", "e-1", ownerActor, {
      ...baseEntryInput,
      excludedFromBudget: false,
    });
    expect(mockJournalRepo.updateEntry).toHaveBeenLastCalledWith(
      "e-1",
      expect.objectContaining({ excludedFromBudget: false }),
      expect.anything(),
    );
  });
});

describe("createEntry as guest", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    seedTransaction();
    mockMemberRepo.listByLedger.mockResolvedValue([
      { id: "mem-1", userId: "user-a" },
    ]);
    mockProjectMemberRepo.listUserIdsByProject.mockResolvedValue([]);
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "active",
      lastEntryNo: 0,
    });
    mockAccountRepo.listByLedger.mockResolvedValue([
      account({ id: "acc-default", flags: ["defaultDebit", "defaultCredit"] }),
      account({ id: "acc-food", name: "Food", type: "expense" }),
      account({ id: "acc-salary", name: "Salary", type: "income" }),
    ]);
  });

  it("rejects an entry without a project (403)", async () => {
    await expectStatus(
      () => createEntry("user-b", "led-1", baseEntryInput, guestAccess),
      403,
    );
    expect(mockJournalRepo.createEntry).not.toHaveBeenCalled();
  });

  it("rejects a project outside the ledger or not a member of (404)", async () => {
    mockProjectRepo.findById.mockResolvedValue(null);
    await expectStatus(
      () =>
        createEntry(
          "user-b",
          "led-1",
          { ...baseEntryInput, projectId: "proj-x" },
          guestAccess,
        ),
      404,
    );

    mockProjectRepo.findById.mockResolvedValue({
      id: "proj-1",
      ledgerId: "led-1",
      status: "active",
    });
    mockProjectMemberRepo.findMembership.mockResolvedValue(null);
    await expectStatus(
      () =>
        createEntry(
          "user-b",
          "led-1",
          { ...baseEntryInput, projectId: "proj-1" },
          guestAccess,
        ),
      404,
    );
  });

  it("rejects entries whose explicit accounts are not expense categories (403)", async () => {
    mockProjectRepo.findById.mockResolvedValue({
      id: "proj-1",
      ledgerId: "led-1",
      status: "active",
    });
    mockProjectMemberRepo.findMembership.mockResolvedValue({ id: "pm-1" });
    await expectStatus(
      () =>
        createEntry(
          "user-b",
          "led-1",
          {
            ...baseEntryInput,
            projectId: "proj-1",
            lines: [
              { accountId: "acc-salary", debit: 0, credit: 50 },
              { accountId: "acc-default", debit: 50, credit: 0 },
            ],
          },
          guestAccess,
        ),
      403,
    );
    expect(mockJournalRepo.createEntry).not.toHaveBeenCalled();
  });

  it("posts an expense against the default pocket in the guest's project", async () => {
    mockProjectRepo.findById.mockResolvedValue({
      id: "proj-1",
      ledgerId: "led-1",
      status: "active",
    });
    mockProjectMemberRepo.findMembership.mockResolvedValue({ id: "pm-1" });
    mockJournalRepo.createEntry.mockResolvedValue({ id: "e-g1" });
    await createEntry(
      "user-b",
      "led-1",
      {
        ...baseEntryInput,
        projectId: "proj-1",
        lines: [
          // Expense category chosen explicitly; pocket side deferred (null).
          { accountId: null, debit: 0, credit: 50 },
          { accountId: "acc-food", debit: 50, credit: 0 },
        ],
      },
      guestAccess,
    );
    expect(mockJournalRepo.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "proj-1" }),
      expect.anything(),
    );
  });

  it("passes the client's countsInLedger through and stamps guestCreated for guests", async () => {
    mockProjectRepo.findById.mockResolvedValue({
      id: "proj-1",
      ledgerId: "led-1",
      status: "active",
    });
    mockProjectMemberRepo.findMembership.mockResolvedValue({ id: "pm-1" });
    mockJournalRepo.createEntry.mockResolvedValue({ id: "e-g2" });
    await createEntry(
      "user-b",
      "led-1",
      {
        ...baseEntryInput,
        projectId: "proj-1",
        countsInLedger: true,
        lines: [
          { accountId: "acc-food", debit: 50, credit: 0 },
          { accountId: "acc-default", debit: 0, credit: 50 },
        ],
      },
      guestAccess,
    );
    // countsInLedger is pure user intent (the toggle is hidden in the
    // guest form, so it stays at the default true); the guest rule lives
    // only in the system-set guestCreated snapshot.
    expect(mockJournalRepo.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ countsInLedger: true, guestCreated: true }),
      expect.anything(),
    );
  });

  it("rejects guest entries that never touch an expense category (403)", async () => {
    mockProjectRepo.findById.mockResolvedValue({
      id: "proj-1",
      ledgerId: "led-1",
      status: "active",
    });
    mockProjectMemberRepo.findMembership.mockResolvedValue({ id: "pm-1" });
    await expectStatus(
      () =>
        createEntry(
          "user-b",
          "led-1",
          {
            ...baseEntryInput,
            projectId: "proj-1",
            lines: [
              // Pocket to pocket transfer: no expense line.
              { accountId: "acc-default", debit: 0, credit: 50 },
              { accountId: "acc-default", debit: 50, credit: 0 },
            ],
          },
          guestAccess,
        ),
      403,
    );
  });
});

describe("entry payer (paidByUserId)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    seedTransaction();
    mockMemberRepo.listByLedger.mockResolvedValue([
      { id: "mem-1", userId: "user-a" },
      { id: "mem-2", userId: "user-b" },
    ]);
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "active",
      lastEntryNo: 0,
    });
    mockAccountRepo.listByLedger.mockResolvedValue([
      account({ id: "acc-cash" }),
      account({ id: "acc-food", name: "Food", type: "expense" }),
    ]);
    mockJournalRepo.createEntry.mockResolvedValue({ id: "e-1" });
    mockJournalRepo.updateEntry.mockResolvedValue({ id: "e-1" });
  });

  it("defaults the payer to the creator when omitted", async () => {
    await createEntry("user-a", "led-1", baseEntryInput, editorAccess);
    expect(mockJournalRepo.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ createdById: "user-a", paidById: "user-a" }),
      expect.anything(),
    );
  });

  it("records an explicit payer other than the creator", async () => {
    // Alice records an entry John fronted — the whole point of the field.
    await createEntry(
      "user-a",
      "led-1",
      { ...baseEntryInput, paidByUserId: "user-b" },
      editorAccess,
    );
    expect(mockJournalRepo.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ createdById: "user-a", paidById: "user-b" }),
      expect.anything(),
    );
  });

  it("treats an explicit null payer as the creator on create", async () => {
    await createEntry(
      "user-a",
      "led-1",
      { ...baseEntryInput, paidByUserId: null },
      editorAccess,
    );
    expect(mockJournalRepo.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ paidById: "user-a" }),
      expect.anything(),
    );
  });

  it("rejects a payer who is not a ledger member (400)", async () => {
    await expectStatus(
      () =>
        createEntry(
          "user-a",
          "led-1",
          { ...baseEntryInput, paidByUserId: "user-foreign" },
          editorAccess,
        ),
      400,
    );
    expect(mockJournalRepo.createEntry).not.toHaveBeenCalled();
  });

  it("keeps the current payer when the update omits paidByUserId", async () => {
    mockJournalRepo.findById.mockResolvedValue({
      id: "e-1",
      ledgerId: "led-1",
      projectId: null,
      createdById: "user-a",
      paidById: "user-b",
      countsInLedger: true,
    });
    await updateEntry("led-1", "e-1", ownerActor, baseEntryInput);
    expect(mockJournalRepo.updateEntry).toHaveBeenCalledWith(
      "e-1",
      expect.not.objectContaining({ paidById: expect.anything() }),
      expect.anything(),
    );
  });

  it("reassigns the payer on update when paidByUserId is given", async () => {
    mockJournalRepo.findById.mockResolvedValue({
      id: "e-1",
      ledgerId: "led-1",
      projectId: null,
      createdById: "user-a",
      paidById: "user-a",
      countsInLedger: true,
    });
    await updateEntry("led-1", "e-1", ownerActor, {
      ...baseEntryInput,
      paidByUserId: "user-b",
    });
    expect(mockJournalRepo.updateEntry).toHaveBeenCalledWith(
      "e-1",
      expect.objectContaining({ paidById: "user-b" }),
      expect.anything(),
    );
  });

  it("resets the payer to the original creator on explicit null", async () => {
    mockJournalRepo.findById.mockResolvedValue({
      id: "e-1",
      ledgerId: "led-1",
      projectId: null,
      createdById: "user-a",
      paidById: "user-b",
      countsInLedger: true,
    });
    await updateEntry("led-1", "e-1", ownerActor, {
      ...baseEntryInput,
      paidByUserId: null,
    });
    expect(mockJournalRepo.updateEntry).toHaveBeenCalledWith(
      "e-1",
      expect.objectContaining({ paidById: "user-a" }),
      expect.anything(),
    );
  });

  it("rejects reassigning the payer to a non-member on update (400)", async () => {
    mockJournalRepo.findById.mockResolvedValue({
      id: "e-1",
      ledgerId: "led-1",
      projectId: null,
      createdById: "user-a",
      paidById: "user-a",
      countsInLedger: true,
    });
    await expectStatus(
      () =>
        updateEntry("led-1", "e-1", ownerActor, {
          ...baseEntryInput,
          paidByUserId: "user-foreign",
        }),
      400,
    );
    expect(mockJournalRepo.updateEntry).not.toHaveBeenCalled();
  });

  it("keeps a stored payer who has since left the ledger when the edit resubmits them", async () => {
    // Edit forms echo the entry's stored payer back; resubmitting history
    // is not a reassignment, so a departed payer must not block the edit.
    mockJournalRepo.findById.mockResolvedValue({
      id: "e-1",
      ledgerId: "led-1",
      projectId: null,
      createdById: "user-a",
      paidById: "user-departed",
      countsInLedger: true,
    });
    await updateEntry("led-1", "e-1", ownerActor, {
      ...baseEntryInput,
      paidByUserId: "user-departed",
    });
    expect(mockJournalRepo.updateEntry).toHaveBeenCalledWith(
      "e-1",
      expect.objectContaining({ paidById: "user-departed" }),
      expect.anything(),
    );
  });

  it("still rejects an explicit reassignment onto a departed payer id (400)", async () => {
    mockJournalRepo.findById.mockResolvedValue({
      id: "e-1",
      ledgerId: "led-1",
      projectId: null,
      createdById: "user-a",
      paidById: "user-a",
      countsInLedger: true,
    });
    await expectStatus(
      () =>
        updateEntry("led-1", "e-1", ownerActor, {
          ...baseEntryInput,
          paidByUserId: "user-departed",
        }),
      400,
    );
    expect(mockJournalRepo.updateEntry).not.toHaveBeenCalled();
  });
});

describe("updateEntry as guest", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    seedTransaction();
    mockMemberRepo.listByLedger.mockResolvedValue([
      { id: "mem-1", userId: "user-a" },
    ]);
    mockProjectMemberRepo.listUserIdsByProject.mockResolvedValue([]);
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "active",
    });
    mockAccountRepo.listByLedger.mockResolvedValue([
      account({ id: "acc-default", flags: ["defaultDebit", "defaultCredit"] }),
      account({ id: "acc-food", name: "Food", type: "expense" }),
    ]);
  });

  it("rejects editing an entry the guest did not create (404)", async () => {
    mockJournalRepo.findById.mockResolvedValue({
      id: "e-1",
      ledgerId: "led-1",
      projectId: "proj-1",
      createdById: "user-a",
    });
    await expectStatus(
      () =>
        updateEntry("led-1", "e-1", guestActor, {
          ...baseEntryInput,
          projectId: "proj-1",
        }),
      404,
    );
    expect(mockJournalRepo.updateEntry).not.toHaveBeenCalled();
  });

  it("rejects moving the entry out of its project (403)", async () => {
    mockJournalRepo.findById.mockResolvedValue({
      id: "e-1",
      ledgerId: "led-1",
      projectId: "proj-1",
      createdById: "user-b",
    });
    await expectStatus(
      () =>
        updateEntry("led-1", "e-1", guestActor, {
          ...baseEntryInput,
          projectId: "proj-other",
        }),
      403,
    );
    expect(mockJournalRepo.updateEntry).not.toHaveBeenCalled();
  });

  it("treats an omitted projectId as 'no change' for guests", async () => {
    mockJournalRepo.findById.mockResolvedValue({
      id: "e-1",
      ledgerId: "led-1",
      projectId: "proj-1",
      createdById: "user-b",
    });
    mockJournalRepo.updateEntry.mockResolvedValue({ id: "e-1" });
    await updateEntry("led-1", "e-1", guestActor, {
      date: new Date("2026-08-01T00:00:00Z"),
      memo: "groceries",
      lines: [
        { accountId: "acc-food", debit: 50, credit: 0 },
        { accountId: "acc-default", debit: 0, credit: 50 },
      ],
    });
    expect(mockJournalRepo.updateEntry).toHaveBeenCalledWith(
      "e-1",
      expect.objectContaining({ projectId: "proj-1" }),
      expect.anything(),
    );
  });

  it("rejects editing a projectless (legacy) entry as a guest (404)", async () => {
    mockJournalRepo.findById.mockResolvedValue({
      id: "e-1",
      ledgerId: "led-1",
      projectId: null,
      createdById: "user-b",
    });
    await expectStatus(
      () => updateEntry("led-1", "e-1", guestActor, baseEntryInput),
      404,
    );
    expect(mockJournalRepo.updateEntry).not.toHaveBeenCalled();
  });

  it("honors a guest's countsInLedger toggle (pure user intent)", async () => {
    mockJournalRepo.findById.mockResolvedValue({
      id: "e-1",
      ledgerId: "led-1",
      projectId: "proj-1",
      createdById: "user-b",
      countsInLedger: false,
    });
    mockJournalRepo.updateEntry.mockResolvedValue({ id: "e-1" });
    await updateEntry("led-1", "e-1", guestActor, {
      date: new Date("2026-08-01T00:00:00Z"),
      memo: "groceries",
      countsInLedger: true,
      lines: [
        { accountId: "acc-food", debit: 50, credit: 0 },
        { accountId: "acc-default", debit: 0, credit: 50 },
      ],
    });
    expect(mockJournalRepo.updateEntry).toHaveBeenCalledWith(
      "e-1",
      expect.objectContaining({ countsInLedger: true }),
      expect.anything(),
    );
  });
});

describe("deleteEntry", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    seedTransaction();
  });

  it("rejects a ledger archived after the route's check (race, 400)", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "archived",
    });
    mockJournalRepo.findById.mockResolvedValue({
      id: "e-1",
      ledgerId: "led-1",
    });
    await expectStatus(() => deleteEntry("led-1", "e-1"), 400);
    expect(mockJournalRepo.delete).not.toHaveBeenCalled();
  });

  it("returns 404 when the entry belongs to another ledger", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "active",
    });
    mockJournalRepo.findById.mockResolvedValue({
      id: "e-1",
      ledgerId: "led-other",
    });
    await expectStatus(() => deleteEntry("led-1", "e-1"), 404);
    expect(mockJournalRepo.delete).not.toHaveBeenCalled();
  });

  it("deletes the entry when the ledger is active under the lock", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "active",
    });
    mockJournalRepo.findById.mockResolvedValue({
      id: "e-1",
      ledgerId: "led-1",
    });
    mockJournalRepo.delete.mockResolvedValue({});
    const result = await deleteEntry("led-1", "e-1");
    expect(result).toEqual({ success: true });
    expect(mockJournalRepo.delete).toHaveBeenCalledWith(
      "e-1",
      expect.anything(),
    );
  });
});

describe("entry location", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    seedTransaction();
    mockMemberRepo.listByLedger.mockResolvedValue([
      { id: "mem-1", userId: "user-a" },
      { id: "mem-2", userId: "user-b" },
    ]);
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "active",
      lastEntryNo: 0,
    });
    mockAccountRepo.listByLedger.mockResolvedValue([
      account({ id: "acc-cash" }),
      account({ id: "acc-food", name: "Food", type: "expense" }),
    ]);
    mockJournalRepo.createEntry.mockResolvedValue({ id: "e-1" });
    mockJournalRepo.updateEntry.mockResolvedValue({ id: "e-1" });
  });

  it("flattens a location into the entry's columns on create", async () => {
    await createEntry(
      "user-a",
      "led-1",
      {
        ...baseEntryInput,
        location: {
          addressName: "星巴克",
          address: "北京市海淀区中关村大街1号",
          latitude: 39.983425,
          longitude: 116.322083,
        },
      },
      editorAccess,
    );
    expect(mockJournalRepo.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        address: "北京市海淀区中关村大街1号",
        addressName: "星巴克",
      }),
      expect.anything(),
    );
  });

  it("stores no location columns when the location is omitted", async () => {
    await createEntry("user-a", "led-1", baseEntryInput, editorAccess);
    const data = mockJournalRepo.createEntry.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(data).not.toHaveProperty("address");
    expect(data).not.toHaveProperty("latitude");
  });

  it("keeps the stored location on update when omitted and replaces on an object", async () => {
    mockJournalRepo.findById.mockResolvedValue({
      id: "e-1",
      ledgerId: "led-1",
      countsInLedger: true,
    });

    // Omitted: the edit form doesn't strip the place it didn't show.
    await updateEntry("led-1", "e-1", ownerActor, baseEntryInput);
    const omitted = mockJournalRepo.updateEntry.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(omitted).not.toHaveProperty("location");

    // An object fully replaces the place.
    await updateEntry("led-1", "e-1", ownerActor, {
      ...baseEntryInput,
      location: { addressName: "New Place" },
    });
    expect(mockJournalRepo.updateEntry).toHaveBeenLastCalledWith(
      "e-1",
      expect.objectContaining({
        location: {
          address: null,
          addressName: "New Place",
          latitude: null,
          longitude: null,
        },
      }),
      expect.anything(),
    );
  });

  it("clears the location on an explicit null", async () => {
    mockJournalRepo.findById.mockResolvedValue({
      id: "e-1",
      ledgerId: "led-1",
      countsInLedger: true,
    });
    await updateEntry("led-1", "e-1", ownerActor, {
      ...baseEntryInput,
      location: null,
    });
    expect(mockJournalRepo.updateEntry).toHaveBeenCalledWith(
      "e-1",
      expect.objectContaining({
        location: {
          address: null,
          addressName: null,
          latitude: null,
          longitude: null,
        },
      }),
      expect.anything(),
    );
  });
});

describe("entry merchant", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    seedTransaction();
    mockMemberRepo.listByLedger.mockResolvedValue([
      { id: "mem-1", userId: "user-a" },
      { id: "mem-2", userId: "user-b" },
    ]);
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "active",
      lastEntryNo: 0,
    });
    mockAccountRepo.listByLedger.mockResolvedValue([
      account({ id: "acc-cash" }),
      account({ id: "acc-food", name: "Food", type: "expense" }),
    ]);
    mockJournalRepo.createEntry.mockResolvedValue({ id: "e-1" });
    mockJournalRepo.updateEntry.mockResolvedValue({ id: "e-1" });
  });

  it("passes the merchant through to the repository on create", async () => {
    await createEntry(
      "user-a",
      "led-1",
      { ...baseEntryInput, merchant: "星巴克" },
      editorAccess,
    );
    expect(mockJournalRepo.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ merchant: "星巴克" }),
      expect.anything(),
    );
  });

  it("keeps the stored merchant on update when omitted and replaces on a string", async () => {
    mockJournalRepo.findById.mockResolvedValue({
      id: "e-1",
      ledgerId: "led-1",
      countsInLedger: true,
    });

    // Omitted: the edit form doesn't strip the merchant it didn't show.
    await updateEntry("led-1", "e-1", ownerActor, baseEntryInput);
    const omitted = mockJournalRepo.updateEntry.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(omitted).not.toHaveProperty("merchant");

    // A string replaces the stored merchant.
    await updateEntry("led-1", "e-1", ownerActor, {
      ...baseEntryInput,
      merchant: "全家便利店",
    });
    expect(mockJournalRepo.updateEntry).toHaveBeenLastCalledWith(
      "e-1",
      expect.objectContaining({ merchant: "全家便利店" }),
      expect.anything(),
    );
  });

  it("clears the merchant on an explicit null", async () => {
    mockJournalRepo.findById.mockResolvedValue({
      id: "e-1",
      ledgerId: "led-1",
      countsInLedger: true,
    });
    await updateEntry("led-1", "e-1", ownerActor, {
      ...baseEntryInput,
      merchant: null,
    });
    expect(mockJournalRepo.updateEntry).toHaveBeenCalledWith(
      "e-1",
      expect.objectContaining({ merchant: null }),
      expect.anything(),
    );
  });
});

describe("listEntries memberSharesCents", () => {
  // The members' combined share attached to each listed entry mirrors the
  // dashboard month statement's own math (memberSharesCents over the same
  // split rules), so a ledger journal card can reconcile with the stat
  // totals: only ledger members' slices sum in — project outsiders (no
  // roster row) drop out of the split.
  const food = account({ id: "acc-food", name: "Food", type: "expense" });
  const pocket = account({ id: "acc-default" });

  function entry(overrides: Record<string, unknown> = {}) {
    return {
      id: "e-1",
      ledgerId: "led-1",
      guestCreated: false,
      countsInLedger: true,
      paidById: "user-a",
      lines: [
        { accountId: "acc-default", debit: 0, credit: 30, account: pocket },
        { accountId: "acc-food", debit: 30, credit: 0, account: food },
      ],
      participants: [],
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.resetAllMocks();
    seedTransaction();
    mockMemberRepo.listByLedger.mockResolvedValue([
      { id: "mem-1", userId: "user-a" },
      { id: "mem-2", userId: "user-b" },
    ]);
    mockJournalRepo.countEntries.mockResolvedValue(1);
  });

  it("sums only the members' slices of a tagged split", async () => {
    // ¥30 tagged {user-a (member), user-out (project outsider)}: the
    // outsider's half falls out of the ledger's split — ¥15 counts.
    mockJournalRepo.listEntries.mockResolvedValue([
      entry({ participants: [{ userId: "user-a" }, { userId: "user-out" }] }),
    ]);
    const result = await listEntries("led-1", {}, "owner");
    expect(result.entries[0].memberSharesCents).toBe(1500);
  });

  it("counts an untagged member-paid entry in full and an outsider-paid one at zero", async () => {
    mockJournalRepo.listEntries.mockResolvedValue([
      entry({ id: "e-member", paidById: "user-b" }),
      entry({ id: "e-outsider", paidById: "user-out" }),
    ]);
    const result = await listEntries("led-1", {}, "owner");
    const byId = new Map(result.entries.map((e) => [e.id, e]));
    expect(byId.get("e-member")?.memberSharesCents).toBe(3000);
    expect(byId.get("e-outsider")?.memberSharesCents).toBe(0);
  });

  it("reports zero for a non-guest opt-out but still counts a guest post", async () => {
    // The activity stats (guest posts stay, only non-guest opt-outs drop)
    // are the contract the field mirrors.
    mockJournalRepo.listEntries.mockResolvedValue([
      entry({ id: "e-optout", countsInLedger: false }),
      entry({ id: "e-guest", countsInLedger: false, guestCreated: true }),
    ]);
    const result = await listEntries("led-1", {}, "owner");
    const byId = new Map(result.entries.map((e) => [e.id, e]));
    expect(byId.get("e-optout")?.memberSharesCents).toBe(0);
    expect(byId.get("e-guest")?.memberSharesCents).toBe(3000);
  });

  it("reports zero for a transfer (no expense/income value to split)", async () => {
    mockJournalRepo.listEntries.mockResolvedValue([
      entry({
        lines: [
          { accountId: "acc-default", debit: 0, credit: 30, account: pocket },
          { accountId: "acc-default", debit: 30, credit: 0, account: pocket },
        ],
      }),
    ]);
    const result = await listEntries("led-1", {}, "owner");
    expect(result.entries[0].memberSharesCents).toBe(0);
  });
});

describe("serializeEntry parent account passthrough", () => {
  // entryInclude joins `lines.account.parent` so journal surfaces can render
  // the parent category next to a leaf. `serializeEntry` does not strip the
  // joined object — the spread on `...line` carries it through unchanged.
  it("exposes parent on a sub-category line", () => {
    const entry = {
      id: "e-sub",
      ledgerId: "led-1",
      entryNo: 1,
      date: new Date(),
      memo: null,
      status: "posted",
      createdById: null,
      createdBy: null,
      createdAt: new Date(),
      projectId: null,
      lines: [
        {
          id: "l-1",
          accountId: "acc-meals",
          debit: 50 as unknown as { toString(): string },
          credit: 0 as unknown as { toString(): string },
          memo: null,
          account: {
            id: "acc-meals",
            name: "Meals",
            code: null,
            type: "expense",
            sortOrder: 1,
            icon: "🍚",
            flags: [],
            parent: {
              id: "acc-food",
              name: "Food",
              code: null,
              icon: "🍜",
            },
          },
        },
      ],
    };

    const serialized = serializeEntry(entry);
    const line = serialized.lines[0];

    expect(line.account.parent).toEqual({
      id: "acc-food",
      name: "Food",
      code: null,
      icon: "🍜",
    });
  });

  it("emits null parent for a top-level category line", () => {
    const entry = {
      id: "e-top",
      ledgerId: "led-1",
      entryNo: 2,
      date: new Date(),
      memo: null,
      status: "posted",
      createdById: null,
      createdBy: null,
      createdAt: new Date(),
      projectId: null,
      lines: [
        {
          id: "l-2",
          accountId: "acc-food",
          debit: 50 as unknown as { toString(): string },
          credit: 0 as unknown as { toString(): string },
          memo: null,
          account: {
            id: "acc-food",
            name: "Food",
            code: null,
            type: "expense",
            sortOrder: 0,
            icon: "🍜",
            flags: [],
            parent: null,
          },
        },
      ],
    };

    const serialized = serializeEntry(entry);
    expect(serialized.lines[0].account.parent).toBeNull();
  });

  it("round-trips through journalLineSchema for both shapes", () => {
    const subLine = {
      id: "l-sub",
      accountId: "acc-meals",
      account: {
        id: "acc-meals",
        name: "Meals",
        code: null,
        type: "expense",
        sortOrder: 1,
        icon: "🍚",
        flags: [],
        parent: {
          id: "acc-food",
          name: "Food",
          code: null,
          icon: "🍜",
        },
      },
      debit: 50,
      credit: 0,
      memo: null,
    };

    const parsed = journalLineSchema.parse(subLine);
    expect(parsed.account.parent?.id).toBe("acc-food");

    const topLine = {
      ...subLine,
      account: { ...subLine.account, parent: null },
    };
    const parsedTop = journalLineSchema.parse(topLine);
    expect(parsedTop.account.parent).toBeNull();
  });
});

describe("entry attachments", () => {
  // Photo receipts are staged by the upload route against the LEDGER id;
  // the claim repoints bizId to the entry id at save time. The contract
  // mirrors location/merchant: omitted = keep, null = clear, an array =
  // the exact final set.
  const staged = {
    id: "att-1",
    bizType: "qianlai:journal-entry",
    bizId: "led-1",
    createdBy: "user-a",
  };

  function stagedRow(id: string, bizId: string) {
    return {
      id,
      bizId,
      createdAt: new Date("2026-09-01T00:00:00Z"),
      upload: { mimeType: "image/jpeg", size: 1234 },
    };
  }

  beforeEach(() => {
    vi.resetAllMocks();
    seedTransaction();
    mockMemberRepo.listByLedger.mockResolvedValue([
      { id: "mem-1", userId: "user-a" },
      { id: "mem-2", userId: "user-b" },
    ]);
    mockProjectMemberRepo.listUserIdsByProject.mockResolvedValue([]);
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "active",
      lastEntryNo: 0,
    });
    mockAccountRepo.listByLedger.mockResolvedValue([
      account({ id: "acc-cash" }),
      account({ id: "acc-food", name: "Food", type: "expense" }),
    ]);
    mockJournalRepo.createEntry.mockResolvedValue({ id: "e-1" });
    mockJournalRepo.updateEntry.mockResolvedValue({ id: "e-1" });
  });

  it("claims staged receipts onto the created entry and echoes them", async () => {
    mockPrisma.attachment.findUnique.mockResolvedValue(staged);
    mockPrisma.attachment.findMany.mockResolvedValue([
      stagedRow("att-1", "e-1"),
    ]);

    const result = await createEntry(
      "user-a",
      "led-1",
      { ...baseEntryInput, attachments: ["att-1"] },
      editorAccess,
    );

    expect(mockPrisma.attachment.update).toHaveBeenCalledWith({
      where: { id: "att-1" },
      data: { bizId: "e-1" },
    });
    expect(result.attachments).toEqual([
      {
        id: "att-1",
        mimeType: "image/jpeg",
        size: 1234,
        createdAt: new Date("2026-09-01T00:00:00Z"),
      },
    ]);
  });

  it("rejects a receipt staged against another ledger (400)", async () => {
    mockPrisma.attachment.findUnique.mockResolvedValue({
      ...staged,
      bizId: "led-other",
    });
    await expectStatus(
      () =>
        createEntry(
          "user-a",
          "led-1",
          { ...baseEntryInput, attachments: ["att-1"] },
          editorAccess,
        ),
      400,
    );
    expect(mockJournalRepo.createEntry).toHaveBeenCalled();
    expect(mockPrisma.attachment.update).not.toHaveBeenCalled();
  });

  it("rejects a receipt uploaded by someone else (400)", async () => {
    mockPrisma.attachment.findUnique.mockResolvedValue({
      ...staged,
      createdBy: "user-b",
    });
    await expectStatus(
      () =>
        createEntry(
          "user-a",
          "led-1",
          { ...baseEntryInput, attachments: ["att-1"] },
          editorAccess,
        ),
      400,
    );
  });

  it("rejects a receipt already claimed by another entry (400)", async () => {
    mockPrisma.attachment.findUnique.mockResolvedValue({
      ...staged,
      bizId: "e-other",
    });
    await expectStatus(
      () =>
        createEntry(
          "user-a",
          "led-1",
          { ...baseEntryInput, attachments: ["att-1"] },
          editorAccess,
        ),
      400,
    );
  });

  it("rejects an unknown attachment id (400)", async () => {
    mockPrisma.attachment.findUnique.mockResolvedValue(null);
    await expectStatus(
      () =>
        createEntry(
          "user-a",
          "led-1",
          { ...baseEntryInput, attachments: ["att-x"] },
          editorAccess,
        ),
      400,
    );
  });

  it("leaves receipts untouched when the update omits the field", async () => {
    mockJournalRepo.findById.mockResolvedValue({
      id: "e-1",
      ledgerId: "led-1",
      createdById: "user-a",
      paidById: "user-a",
      countsInLedger: true,
      excludedFromBudget: false,
    });
    // One findMany only: the read echo — never the diff's current-set read.
    mockPrisma.attachment.findMany.mockResolvedValue([]);

    await updateEntry("led-1", "e-1", ownerActor, baseEntryInput);

    expect(mockDeleteAttachmentsByIds).not.toHaveBeenCalled();
    expect(mockPrisma.attachment.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.attachment.findMany).toHaveBeenCalledTimes(1);
  });

  it("replaces receipts on update: deletes dropped ids, claims added ones", async () => {
    mockJournalRepo.findById.mockResolvedValue({
      id: "e-1",
      ledgerId: "led-1",
      createdById: "user-a",
      paidById: "user-a",
      countsInLedger: true,
      excludedFromBudget: false,
    });
    mockPrisma.attachment.findMany
      // first read: the entry's current set
      .mockResolvedValueOnce([{ id: "att-keep" }, { id: "att-drop" }])
      // second read: the echo after the diff
      .mockResolvedValueOnce([
        stagedRow("att-keep", "e-1"),
        stagedRow("att-new", "e-1"),
      ]);
    mockPrisma.attachment.findUnique.mockResolvedValue(staged);

    const result = await updateEntry("led-1", "e-1", ownerActor, {
      ...baseEntryInput,
      attachments: ["att-keep", "att-new"],
    });

    expect(mockDeleteAttachmentsByIds).toHaveBeenCalledWith(
      ["att-drop"],
      expect.anything(),
    );
    expect(mockPrisma.attachment.update).toHaveBeenCalledWith({
      where: { id: "att-new" },
      data: { bizId: "e-1" },
    });
    expect(result.attachments.map((a: { id: string }) => a.id)).toEqual([
      "att-keep",
      "att-new",
    ]);
  });

  it("clears every receipt when the update passes null", async () => {
    mockJournalRepo.findById.mockResolvedValue({
      id: "e-1",
      ledgerId: "led-1",
      createdById: "user-a",
      paidById: "user-a",
      countsInLedger: true,
      excludedFromBudget: false,
    });
    mockPrisma.attachment.findMany
      .mockResolvedValueOnce([{ id: "att-1" }, { id: "att-2" }])
      .mockResolvedValueOnce([]);

    await updateEntry("led-1", "e-1", ownerActor, {
      ...baseEntryInput,
      attachments: null,
    });

    expect(mockDeleteAttachmentsByIds).toHaveBeenCalledWith(
      ["att-1", "att-2"],
      expect.anything(),
    );
  });

  it("deletes the entry's receipts when the entry is deleted", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "active",
    });
    mockJournalRepo.findById.mockResolvedValue({
      id: "e-1",
      ledgerId: "led-1",
      createdById: "user-a",
    });

    await deleteEntry("led-1", "e-1", ownerActor);

    expect(mockJournalRepo.delete).toHaveBeenCalledWith(
      "e-1",
      expect.anything(),
    );
    expect(mockDeleteAttachmentsByBiz).toHaveBeenCalledWith(
      "qianlai:journal-entry",
      "e-1",
      expect.anything(),
    );
  });
});
