import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookAccount } from "#generated/prisma/client";

vi.mock("#lib/db", () => ({
  prisma: {
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})),
  },
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

vi.mock("../journal.repository", () => ({
  journalRepository: {
    createEntry: vi.fn(),
    findById: vi.fn(),
    updateEntry: vi.fn(),
    delete: vi.fn(),
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
  },
}));

import { prisma } from "#lib/db";
import { accountRepository } from "../account.repository";
import { journalRepository } from "../journal.repository";
import {
  createEntry,
  deleteEntry,
  updateEntry,
  validateJournalLines,
} from "../journal.service";
import { ledgerRepository } from "../ledger.repository";
import { ledgerMemberRepository } from "../ledger-member.repository";
import { projectRepository } from "../project.repository";
import { projectMemberRepository } from "../project-member.repository";

const mockPrisma = prisma as unknown as {
  $transaction: ReturnType<typeof vi.fn>;
};
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
};

describe("createEntry", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: unknown) => Promise<unknown>) => fn({}),
    );
    mockMemberRepo.listByLedger.mockResolvedValue([
      { id: "mem-1" },
      { id: "mem-2" },
    ]);
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
    expect(result).toBe(created);
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
            participantMemberIds: ["mem-1", "mem-foreign"],
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
        participantMemberIds: ["mem-2", "mem-1", "mem-2"],
      },
      editorAccess,
    );
    expect(mockJournalRepo.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ participantMemberIds: ["mem-2", "mem-1"] }),
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
      expect.objectContaining({ participantMemberIds: undefined }),
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
      members: [{ userId: "user-b" }, { userId: "user-a" }],
    });
    mockJournalRepo.createEntry.mockResolvedValue({ id: "e-6" });
    await createEntry(
      "user-a",
      "led-1",
      { ...baseEntryInput, projectId: "proj-1" },
      editorAccess,
    );
    // Sorted ledger member ids, one per project member, so the split set
    // is frozen even after membership changes.
    expect(mockJournalRepo.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ participantMemberIds: ["mem-1", "mem-2"] }),
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
        participantMemberIds: ["mem-2"],
      },
      editorAccess,
    );
    expect(mockProjectRepo.findByIdWithMembers).not.toHaveBeenCalled();
    expect(mockJournalRepo.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ participantMemberIds: ["mem-2"] }),
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
});

describe("updateEntry", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: unknown) => Promise<unknown>) => fn({}),
    );
    mockMemberRepo.listByLedger.mockResolvedValue([
      { id: "mem-1" },
      { id: "mem-2" },
    ]);
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
    expect(updated).toEqual({ id: "e-1" });
    expect(mockJournalRepo.updateEntry).toHaveBeenCalledWith(
      "e-1",
      expect.objectContaining({
        memo: "edited",
        participantMemberIds: [],
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
      expect.objectContaining({ participantMemberIds: ["mem-2"] }),
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
          participantMemberIds: ["mem-foreign"],
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
});

describe("createEntry as guest", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: unknown) => Promise<unknown>) => fn({}),
    );
    mockMemberRepo.listByLedger.mockResolvedValue([{ id: "mem-1" }]);
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

  it("forces countsInLedger=false and stamps guestCreated for guests", async () => {
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
    // The forced countsInLedger=false is belt; the system-set guestCreated
    // snapshot is suspenders — the client never gets a say in either.
    expect(mockJournalRepo.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ countsInLedger: false, guestCreated: true }),
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

describe("updateEntry as guest", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: unknown) => Promise<unknown>) => fn({}),
    );
    mockMemberRepo.listByLedger.mockResolvedValue([{ id: "mem-1" }]);
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

  it("pins countsInLedger to the entry's value for guests", async () => {
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
      expect.objectContaining({ countsInLedger: false }),
      expect.anything(),
    );
  });
});

describe("deleteEntry", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: unknown) => Promise<unknown>) => fn({}),
    );
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
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: unknown) => Promise<unknown>) => fn({}),
    );
    mockMemberRepo.listByLedger.mockResolvedValue([
      { id: "mem-1" },
      { id: "mem-2" },
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
