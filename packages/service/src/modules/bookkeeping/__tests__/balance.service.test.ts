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

vi.mock("../account.repository", () => ({
  accountRepository: {
    findById: vi.fn(),
    listByLedger: vi.fn(),
    findAdjustmentOffsetAccount: vi.fn(),
    findFirstActiveByType: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("../journal.repository", () => ({
  journalRepository: {
    createEntry: vi.fn(),
    sumLinesByAccount: vi.fn(),
  },
}));

import { accountRepository } from "../account.repository";
import { setAccountBalance } from "../balance.service";
import { journalRepository } from "../journal.repository";
import { ledgerRepository } from "../ledger.repository";

const mockAccountRepo = accountRepository as unknown as {
  findById: ReturnType<typeof vi.fn>;
  listByLedger: ReturnType<typeof vi.fn>;
  findAdjustmentOffsetAccount: ReturnType<typeof vi.fn>;
  findFirstActiveByType: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
};
const mockLedgerRepo = ledgerRepository as unknown as {
  findById: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};
const mockJournalRepo = journalRepository as unknown as {
  createEntry: ReturnType<typeof vi.fn>;
  sumLinesByAccount: ReturnType<typeof vi.fn>;
};

function account(overrides: Partial<BookAccount> = {}): BookAccount {
  return {
    id: "acc-cash",
    ledgerId: "led-1",
    name: "Cash",
    type: "asset",
    sortOrder: 10,
    parentId: null,
    status: "active",
    flags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as BookAccount;
}

const LEDGER = { id: "led-1", lastEntryNo: 3, status: "active" };
const OFFSET = account({
  id: "acc-open",
  name: "Opening Balance",
  type: "equity",
  flags: ["builtin", "adjustmentOffset"],
});
const AS_OF = new Date("2026-08-01T00:00:00.000Z");

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

beforeEach(() => {
  vi.clearAllMocks();
  mockLedgerRepo.findById.mockResolvedValue({ ...LEDGER });
  mockAccountRepo.findById.mockResolvedValue(
    account({ id: "acc-cash", type: "asset" }),
  );
  mockAccountRepo.listByLedger.mockResolvedValue([
    account({ id: "acc-cash", type: "asset" }),
    OFFSET,
  ]);
  mockAccountRepo.findAdjustmentOffsetAccount.mockResolvedValue(OFFSET);
  mockAccountRepo.findFirstActiveByType.mockResolvedValue(null);
  mockJournalRepo.sumLinesByAccount.mockResolvedValue([]);
  mockJournalRepo.createEntry.mockImplementation(
    (data: { lines: Array<{ debit: number; credit: number }> }) => ({
      ...data,
      id: "entry-1",
      entryNo: 4,
      lines: data.lines,
    }),
  );
});

/** Decimal lines as plain numbers for assertion. */
function plainLines(call: {
  lines: Array<{
    accountId: string;
    debit: number;
    credit: number;
    memo?: string;
  }>;
}) {
  return call.lines.map((l) => ({
    accountId: l.accountId,
    debit: Number(l.debit),
    credit: Number(l.credit),
    memo: l.memo,
  }));
}

describe("setAccountBalance", () => {
  it("debits an asset account up to the target and credits the offset", async () => {
    // Cash has 100 debit so far; setting 250 as-of requires a +150 debit.
    mockJournalRepo.sumLinesByAccount.mockResolvedValue([
      { accountId: "acc-cash", _sum: { debit: 100, credit: 0 } },
    ]);
    const result = await setAccountBalance("user-1", "led-1", "acc-cash", {
      balance: 250,
      date: AS_OF,
    });
    expect(result.adjusted).toBe(true);
    expect(plainLines(mockJournalRepo.createEntry.mock.calls[0][0])).toEqual([
      { accountId: "acc-cash", debit: 150, credit: 0, memo: undefined },
      { accountId: "acc-open", debit: 0, credit: 150, memo: undefined },
    ]);
    // Entry dated on the as-of day, entryNo bumped under the ledger lock.
    expect(mockJournalRepo.createEntry.mock.calls[0][0].date).toEqual(AS_OF);
    expect(mockLedgerRepo.update).toHaveBeenCalledWith(
      "led-1",
      { lastEntryNo: 4 },
      {},
    );
  });

  it("credits an asset account when lowering the balance", async () => {
    mockJournalRepo.sumLinesByAccount.mockResolvedValue([
      { accountId: "acc-cash", _sum: { debit: 500, credit: 200 } },
    ]);
    await setAccountBalance("user-1", "led-1", "acc-cash", {
      balance: 100,
      date: AS_OF,
    });
    expect(plainLines(mockJournalRepo.createEntry.mock.calls[0][0])).toEqual([
      { accountId: "acc-cash", debit: 0, credit: 200, memo: undefined },
      { accountId: "acc-open", debit: 200, credit: 0, memo: undefined },
    ]);
  });

  it("treats liability balances as credit-normal", async () => {
    const card = account({ id: "acc-card", type: "liability" });
    mockAccountRepo.findById.mockResolvedValue(card);
    mockAccountRepo.listByLedger.mockResolvedValue([card, OFFSET]);
    mockJournalRepo.sumLinesByAccount.mockResolvedValue([
      { accountId: "acc-card", _sum: { debit: 0, credit: 100 } },
    ]);
    await setAccountBalance("user-1", "led-1", "acc-card", {
      balance: 250,
      date: AS_OF,
    });
    expect(plainLines(mockJournalRepo.createEntry.mock.calls[0][0])).toEqual([
      { accountId: "acc-card", debit: 0, credit: 150, memo: undefined },
      { accountId: "acc-open", debit: 150, credit: 0, memo: undefined },
    ]);
  });

  it("is a no-op when already at the target balance", async () => {
    mockJournalRepo.sumLinesByAccount.mockResolvedValue([
      { accountId: "acc-cash", _sum: { debit: 100, credit: 0 } },
    ]);
    const result = await setAccountBalance("user-1", "led-1", "acc-cash", {
      balance: 100,
      date: AS_OF,
    });
    expect(result).toEqual({ adjusted: false, entry: null });
    expect(mockJournalRepo.createEntry).not.toHaveBeenCalled();
  });

  it("only sums entries dated at or before the as-of instant", async () => {
    mockJournalRepo.sumLinesByAccount.mockResolvedValue([]);
    await setAccountBalance("user-1", "led-1", "acc-cash", {
      balance: 100,
      date: AS_OF,
    });
    expect(mockJournalRepo.sumLinesByAccount).toHaveBeenCalledWith(
      "led-1",
      { to: AS_OF },
      {},
    );
  });

  it("auto-creates a builtin offset account when none exists", async () => {
    mockAccountRepo.findAdjustmentOffsetAccount.mockResolvedValue(null);
    mockAccountRepo.findFirstActiveByType.mockResolvedValue(null);
    mockAccountRepo.create.mockResolvedValue(
      account({ id: "acc-new", name: "Balance Adjustment", type: "equity" }),
    );
    mockAccountRepo.listByLedger.mockResolvedValue([
      account({ id: "acc-cash" }),
      account({ id: "acc-new", name: "Balance Adjustment", type: "equity" }),
    ]);
    await setAccountBalance("user-1", "led-1", "acc-cash", {
      balance: 100,
      date: AS_OF,
    });
    expect(mockAccountRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ledgerId: "led-1",
        type: "equity",
        flags: ["builtin", "adjustmentOffset"],
      }),
      {},
    );
    const lines = plainLines(mockJournalRepo.createEntry.mock.calls[0][0]);
    expect(lines[1].accountId).toBe("acc-new");
  });

  it("falls back to any active equity account for legacy ledgers", async () => {
    mockAccountRepo.findAdjustmentOffsetAccount.mockResolvedValue(null);
    const legacy = account({
      id: "acc-legacy",
      name: "期初余额",
      type: "equity",
    });
    mockAccountRepo.findFirstActiveByType.mockResolvedValue(legacy);
    mockAccountRepo.listByLedger.mockResolvedValue([
      account({ id: "acc-cash" }),
      legacy,
    ]);
    await setAccountBalance("user-1", "led-1", "acc-cash", {
      balance: 100,
      date: AS_OF,
    });
    expect(mockAccountRepo.create).not.toHaveBeenCalled();
    const lines = plainLines(mockJournalRepo.createEntry.mock.calls[0][0]);
    expect(lines[1].accountId).toBe("acc-legacy");
  });

  it("rejects non-asset/liability accounts (400)", async () => {
    mockAccountRepo.findById.mockResolvedValue(
      account({ type: "expense", name: "Food" }),
    );
    await expectStatus(
      () =>
        setAccountBalance("user-1", "led-1", "acc-cash", {
          balance: 100,
          date: AS_OF,
        }),
      400,
    );
  });

  it("rejects archived accounts (400)", async () => {
    mockAccountRepo.findById.mockResolvedValue(account({ status: "archived" }));
    await expectStatus(
      () =>
        setAccountBalance("user-1", "led-1", "acc-cash", {
          balance: 100,
          date: AS_OF,
        }),
      400,
    );
  });

  it("rejects accounts from another ledger (404)", async () => {
    mockAccountRepo.findById.mockResolvedValue(
      account({ ledgerId: "led-other" }),
    );
    await expectStatus(
      () =>
        setAccountBalance("user-1", "led-1", "acc-cash", {
          balance: 100,
          date: AS_OF,
        }),
      404,
    );
  });
});
