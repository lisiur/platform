import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../account.repository", () => ({
  accountRepository: {
    listByLedger: vi.fn(),
  },
}));

vi.mock("../journal.repository", () => ({
  journalRepository: {
    listRecent: vi.fn(),
    sumLinesByAccount: vi.fn(),
  },
}));

vi.mock("../ledger-member.repository", () => ({
  ledgerMemberRepository: {
    listByLedger: vi.fn(),
  },
}));

import { accountRepository } from "../account.repository";
import { journalRepository } from "../journal.repository";
import { dashboard } from "../report.service";

const mockAccountRepo = accountRepository as unknown as {
  listByLedger: ReturnType<typeof vi.fn>;
};
const mockJournalRepo = journalRepository as unknown as {
  listRecent: ReturnType<typeof vi.fn>;
  sumLinesByAccount: ReturnType<typeof vi.fn>;
};

function expenseAccount() {
  return {
    id: "acc-food",
    ledgerId: "led-1",
    name: "Food",
    code: "food",
    type: "expense",
    sortOrder: 70,
    parentId: null,
    status: "active",
    icon: null,
    flags: [],
    meta: null,
    createdAt: new Date(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAccountRepo.listByLedger.mockResolvedValue([expenseAccount()]);
  mockJournalRepo.listRecent.mockResolvedValue([]);
  mockJournalRepo.sumLinesByAccount.mockResolvedValue([]);
});

/** dashboard() calls sumLinesByAccount twice: [0] = all-time, [1] = month. */
function monthWindowCall() {
  return mockJournalRepo.sumLinesByAccount.mock.calls[1]?.[1] as {
    from: Date;
    to: Date;
    countsInLedger?: boolean;
  };
}

describe("dashboard", () => {
  it("defaults to the month containing now", async () => {
    const before = new Date();

    const result = await dashboard("led-1");

    const window = monthWindowCall();
    expect(window.from.getUTCMonth()).toBe(before.getUTCMonth());
    expect(window.from.getUTCFullYear()).toBe(before.getUTCFullYear());
    expect(window.from.getUTCDate()).toBe(1);
    expect(result.month.year).toBe(before.getUTCFullYear());
    expect(result.month.month).toBe(before.getUTCMonth() + 1);
  });

  it("summarizes the caller-provided window when from/to are given", async () => {
    mockJournalRepo.sumLinesByAccount.mockResolvedValue([
      { accountId: "acc-food", _sum: { debit: 2500, credit: 0 } },
    ]);

    const from = new Date(Date.UTC(2025, 11, 1));
    const to = new Date(Date.UTC(2025, 12, 0, 23, 59, 59, 999));
    const result = await dashboard("led-1", "viewer", new Date(), {
      from,
      to,
    });

    const window = monthWindowCall();
    expect(window.from).toEqual(from);
    expect(window.to).toEqual(to);
    expect(result.month.year).toBe(2025);
    expect(result.month.month).toBe(12);
    expect(result.month.totalExpense).toBe(2500);
    expect(result.month.totalIncome).toBe(0);
    expect(result.month.net).toBe(-2500);
  });

  it("sums the month and recent entries over counted entries only, net worth over all", async () => {
    await dashboard("led-1");

    // Call [0] is the all-time net-worth sum: unfiltered (accounting truth).
    const allTimeWindow = mockJournalRepo.sumLinesByAccount.mock.calls[0]?.[1];
    expect(allTimeWindow?.countsInLedger).toBeUndefined();

    // Call [1] is the month statement: behavioral view — flagged-out entries
    // (guest posts, opted-out repayments) don't count.
    const monthWindow = monthWindowCall();
    expect(monthWindow.countsInLedger).toBe(true);

    expect(mockJournalRepo.listRecent).toHaveBeenCalledWith("led-1", 5, {
      countsInLedger: true,
    });
  });
});

describe("incomeStatement vs trialBalance flag policy", () => {
  it("incomeStatement counts counted entries only; trialBalance stays unfiltered", async () => {
    const { incomeStatement, trialBalance } = await import("../report.service");

    await incomeStatement("led-1");
    expect(mockJournalRepo.sumLinesByAccount).toHaveBeenCalledWith("led-1", {
      countsInLedger: true,
    });

    mockJournalRepo.sumLinesByAccount.mockClear();
    await trialBalance("led-1");
    expect(mockJournalRepo.sumLinesByAccount).toHaveBeenCalledWith("led-1", {});
  });
});
