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
    listShareEntries: vi.fn(),
  },
  // The real predicate constants, so report.service spreads actual values.
  personalBooksWhere: { countsInLedger: true, guestCreated: false },
}));

vi.mock("../ledger-member.repository", () => ({
  ledgerMemberRepository: {
    listByLedger: vi.fn(),
  },
}));

import { accountRepository } from "../account.repository";
import { journalRepository } from "../journal.repository";
import { dashboard, incomeStatement } from "../report.service";

const mockAccountRepo = accountRepository as unknown as {
  listByLedger: ReturnType<typeof vi.fn>;
};
const mockJournalRepo = journalRepository as unknown as {
  listRecent: ReturnType<typeof vi.fn>;
  sumLinesByAccount: ReturnType<typeof vi.fn>;
  listShareEntries: ReturnType<typeof vi.fn>;
};

function account(
  overrides: Partial<{ id: string; name: string; type: string }> = {},
) {
  return {
    id: overrides.id ?? "acc-food",
    ledgerId: "led-1",
    name: overrides.name ?? "Food",
    code: (overrides.name ?? "Food").toLowerCase(),
    type: overrides.type ?? "expense",
    sortOrder: 70,
    parentId: null,
    status: "active",
    icon: null,
    flags: [],
    meta: null,
    createdAt: new Date(),
  };
}

/** A plain number stands in for Prisma Decimal in these tests. */
function shareEntry(
  overrides: {
    createdById?: string | null;
    lines?: Array<{
      accountId: string;
      debit: number;
      credit: number;
      type?: string;
    }>;
    participants?: string[];
  } = {},
) {
  return {
    createdById: overrides.createdById ?? "user-a",
    lines: (overrides.lines ?? []).map((line) => ({
      accountId: line.accountId,
      debit: line.debit,
      credit: line.credit,
      account: { type: line.type ?? "expense" },
    })),
    participants: (overrides.participants ?? ["user-a"]).map((userId) => ({
      ledgerMember: { userId },
    })),
  };
}

const pocketTransfer = {
  accountId: "acc-pocket",
  debit: 0,
  credit: 0,
  type: "asset",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAccountRepo.listByLedger.mockResolvedValue([
    account(),
    account({ id: "acc-salary", name: "Salary", type: "income" }),
    account({ id: "acc-pocket", name: "Pocket", type: "asset" }),
  ]);
  mockJournalRepo.listRecent.mockResolvedValue([]);
  mockJournalRepo.sumLinesByAccount.mockResolvedValue([]);
  mockJournalRepo.listShareEntries.mockResolvedValue([]);
});

describe("incomeStatement (share-based)", () => {
  it("counts the viewer's participant share, not what they fronted", async () => {
    mockJournalRepo.listShareEntries.mockResolvedValue([
      // The viewer fronted 100 for a two-person expense: their actual
      // spending is 50.
      shareEntry({
        lines: [
          { accountId: "acc-food", debit: 100, credit: 0 },
          pocketTransfer,
        ],
        participants: ["user-a", "user-b"],
      }),
    ]);

    const result = await incomeStatement("user-a", "led-1");

    expect(result.totalExpense).toBe(50);
    expect(result.totalIncome).toBe(0);
  });

  it("includes the viewer's share of guest-created entries", async () => {
    mockJournalRepo.listShareEntries.mockResolvedValue([
      // A guest posted 30 for something the viewer shared in: real
      // consumption, counted through the participant share.
      shareEntry({
        createdById: "user-guest",
        lines: [{ accountId: "acc-food", debit: 30, credit: 0 }],
        participants: ["user-a", "user-guest"],
      }),
    ]);

    const result = await incomeStatement("user-a", "led-1");

    expect(result.totalExpense).toBe(15);
  });

  it("counts the viewer's own untagged entries in full", async () => {
    mockJournalRepo.listShareEntries.mockResolvedValue([
      shareEntry({
        createdById: "user-a",
        lines: [{ accountId: "acc-food", debit: 80, credit: 0 }],
        participants: [],
      }),
    ]);

    const result = await incomeStatement("user-a", "led-1");

    expect(result.totalExpense).toBe(80);
  });

  it("gives the split remainder to the earliest sorted participant", async () => {
    mockJournalRepo.listShareEntries.mockResolvedValue([
      // 100 across three members: 33.34 / 33.33 / 33.33.
      shareEntry({
        lines: [{ accountId: "acc-food", debit: 100, credit: 0 }],
        participants: ["user-c", "user-a", "user-b"],
      }),
    ]);

    const result = await incomeStatement("user-a", "led-1");

    expect(result.totalExpense).toBe(33.34);
  });

  it("attributes income-heavy entries to income rows at the viewer's share", async () => {
    mockJournalRepo.listShareEntries.mockResolvedValue([
      shareEntry({
        createdById: "user-b",
        lines: [
          { accountId: "acc-salary", debit: 0, credit: 90, type: "income" },
        ],
        participants: ["user-a", "user-b"],
      }),
    ]);

    const result = await incomeStatement("user-a", "led-1");

    expect(result.totalIncome).toBe(45);
    expect(result.totalExpense).toBe(0);
  });

  it("absorbs per-line rounding drift so rows sum to the exact share", async () => {
    mockJournalRepo.listShareEntries.mockResolvedValue([
      // 100 split in two (share 50) across lines whose half-cent
      // attributions would round up on both sides (5001 ≠ 5000).
      shareEntry({
        lines: [
          { accountId: "acc-food", debit: 10.01, credit: 0 },
          { accountId: "acc-food", debit: 89.99, credit: 0 },
        ],
        participants: ["user-a", "user-b"],
      }),
    ]);

    const result = await incomeStatement("user-a", "led-1");

    expect(result.totalExpense).toBe(50);
  });

  it("queries share entries for the requested window", async () => {
    const from = new Date(Date.UTC(2025, 11, 1));
    const to = new Date(Date.UTC(2025, 11, 31, 23, 59, 59, 999));
    await incomeStatement("user-a", "led-1", { from, to });

    expect(mockJournalRepo.listShareEntries).toHaveBeenCalledWith(
      "led-1",
      "user-a",
      { from, to },
    );
  });
});

describe("dashboard", () => {
  it("defaults to the month containing now", async () => {
    const before = new Date();

    const result = await dashboard("user-a", "led-1");
    const window = mockJournalRepo.listShareEntries.mock.calls[0]?.[2] as {
      from: Date;
    };

    expect(window.from.getUTCMonth()).toBe(before.getUTCMonth());
    expect(window.from.getUTCFullYear()).toBe(before.getUTCFullYear());
    expect(window.from.getUTCDate()).toBe(1);
    expect(result.month.year).toBe(before.getUTCFullYear());
    expect(result.month.month).toBe(before.getUTCMonth() + 1);
  });

  it("summarizes the caller-provided window when from/to are given", async () => {
    mockJournalRepo.listShareEntries.mockResolvedValue([
      shareEntry({
        lines: [{ accountId: "acc-food", debit: 100, credit: 0 }],
        participants: ["user-a", "user-b"],
      }),
    ]);

    const from = new Date(Date.UTC(2025, 11, 1));
    const to = new Date(Date.UTC(2025, 12, 0, 23, 59, 59, 999));
    const result = await dashboard("user-a", "led-1", "viewer", new Date(), {
      from,
      to,
    });
    const window = mockJournalRepo.listShareEntries.mock.calls[0]?.[2] as {
      from: Date;
      to: Date;
    };

    expect(window.from).toEqual(from);
    expect(window.to).toEqual(to);
    expect(result.month.year).toBe(2025);
    expect(result.month.month).toBe(12);
    expect(result.month.totalExpense).toBe(50);
    expect(result.month.totalIncome).toBe(0);
    expect(result.month.net).toBe(-50);
  });

  it("keeps net worth accounting-true while the month statement is share-based", async () => {
    mockJournalRepo.sumLinesByAccount.mockResolvedValue([
      // The viewer fronted 100 out of the pocket in total.
      { accountId: "acc-pocket", _sum: { debit: 0, credit: 100 } },
    ]);
    mockJournalRepo.listShareEntries.mockResolvedValue([
      shareEntry({
        lines: [{ accountId: "acc-food", debit: 100, credit: 0 }],
        participants: ["user-a", "user-b"],
      }),
    ]);

    const result = await dashboard("user-a", "led-1");

    // Net worth: unfiltered gross (accounting truth — the money moved).
    expect(mockJournalRepo.sumLinesByAccount).toHaveBeenCalledWith("led-1", {});
    expect(result.assets).toBe(-100);
    // Month statement: the viewer's share of the shared expense.
    expect(result.month.totalExpense).toBe(50);
    // Recent entries: personal-books only (user opt-outs + guest posts out).
    expect(mockJournalRepo.listRecent).toHaveBeenCalledWith("led-1", 5, {
      countsInLedger: true,
      guestCreated: false,
    });
  });
});

describe("trialBalance", () => {
  it("stays accounting-true: sums every entry regardless of flags", async () => {
    const { trialBalance } = await import("../report.service");

    await trialBalance("led-1");
    expect(mockJournalRepo.sumLinesByAccount).toHaveBeenCalledWith("led-1", {});
  });
});
