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
  ledgerMemberRepository: {},
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
    delete: vi.fn(),
  },
}));

import { prisma } from "#lib/db";
import { accountRepository } from "../account.repository";
import { journalRepository } from "../journal.repository";
import {
  createEntry,
  deleteEntry,
  validateJournalLines,
} from "../journal.service";
import { ledgerRepository } from "../ledger.repository";

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
const mockJournalRepo = journalRepository as unknown as {
  createEntry: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function account(overrides: Partial<BookAccount> = {}): BookAccount {
  return {
    id: "acc-1",
    ledgerId: "led-1",
    code: "1001",
    name: "Cash",
    type: "asset",
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
    code: "5001",
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

describe("createEntry", () => {
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
    await expectStatus(
      () => createEntry("user-a", "led-1", baseEntryInput),
      400,
    );
    expect(mockJournalRepo.createEntry).not.toHaveBeenCalled();
  });

  it("returns 404 when the ledger no longer exists", async () => {
    mockLedgerRepo.findById.mockResolvedValue(null);
    await expectStatus(
      () => createEntry("user-a", "led-1", baseEntryInput),
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
      account({ id: "acc-food", code: "5001", name: "Food", type: "expense" }),
    ]);
    const created = { id: "e-1" };
    mockJournalRepo.createEntry.mockResolvedValue(created);
    const result = await createEntry("user-a", "led-1", baseEntryInput);
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
      account({ id: "acc-food", code: "5001", name: "Food", type: "expense" }),
    ]);
    mockJournalRepo.createEntry.mockResolvedValue({ id: "e-2" });
    await createEntry("user-a", "led-1", baseEntryInput);
    expect(mockJournalRepo.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ entryNo: 4 }),
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
