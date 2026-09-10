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
    listTaggedEntries: vi.fn(),
  },
}));

vi.mock("../ledger-member.repository", () => ({
  ledgerMemberRepository: {
    listByLedger: vi.fn(),
  },
}));

vi.mock("../project-member.repository", () => ({
  projectMemberRepository: {
    listUsersInLedger: vi.fn(),
  },
}));

import { accountRepository } from "../account.repository";
import { journalRepository } from "../journal.repository";
import { ledgerMemberRepository } from "../ledger-member.repository";
import { projectMemberRepository } from "../project-member.repository";
import { dashboard, incomeStatement, memberTurnover } from "../report.service";

const mockAccountRepo = accountRepository as unknown as {
  listByLedger: ReturnType<typeof vi.fn>;
};
const mockJournalRepo = journalRepository as unknown as {
  listRecent: ReturnType<typeof vi.fn>;
  sumLinesByAccount: ReturnType<typeof vi.fn>;
  listShareEntries: ReturnType<typeof vi.fn>;
  listTaggedEntries: ReturnType<typeof vi.fn>;
};
const mockMemberRepo = ledgerMemberRepository as unknown as {
  listByLedger: ReturnType<typeof vi.fn>;
};
const mockProjectMemberRepo = projectMemberRepository as unknown as {
  listUsersInLedger: ReturnType<typeof vi.fn>;
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
    paidById?: string | null;
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
    paidById: overrides.paidById ?? "user-a",
    lines: (overrides.lines ?? []).map((line) => ({
      accountId: line.accountId,
      debit: line.debit,
      credit: line.credit,
      account: { type: line.type ?? "expense" },
    })),
    participants: (overrides.participants ?? ["user-a"]).map((userId) => ({
      userId,
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
  mockProjectMemberRepo.listUsersInLedger.mockResolvedValue([]);
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
        paidById: "user-guest",
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
        paidById: "user-a",
        lines: [{ accountId: "acc-food", debit: 80, credit: 0 }],
        participants: [],
      }),
    ]);

    const result = await incomeStatement("user-a", "led-1");

    expect(result.totalExpense).toBe(80);
  });

  it("charges untagged entries to the payer, not the recorder", async () => {
    mockJournalRepo.listShareEntries.mockResolvedValue([
      // The viewer recorded the entry but John fronted the 80: it belongs
      // to John's personal books, not the viewer's.
      shareEntry({
        paidById: "user-b",
        lines: [{ accountId: "acc-food", debit: 80, credit: 0 }],
        participants: [],
      }),
    ]);

    const result = await incomeStatement("user-a", "led-1");

    expect(result.totalExpense).toBe(0);
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
        paidById: "user-b",
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
  /** The month-statement call: the one carrying a from/to window. */
  function monthWindowCall(): { from?: Date; to?: Date } | undefined {
    return mockJournalRepo.sumLinesByAccount.mock.calls
      .map((call) => call[1] as { from?: Date; to?: Date })
      .find((window) => window.from);
  }

  it("defaults to the month containing now", async () => {
    const before = new Date();

    const result = await dashboard("led-1");

    // Net worth stays the all-time sum; the month statement gets the window.
    expect(mockJournalRepo.sumLinesByAccount).toHaveBeenCalledWith("led-1", {});
    const window = monthWindowCall();
    expect(window?.from?.getUTCMonth()).toBe(before.getUTCMonth());
    expect(window?.from?.getUTCFullYear()).toBe(before.getUTCFullYear());
    expect(window?.from?.getUTCDate()).toBe(1);
    expect(result.month.year).toBe(before.getUTCFullYear());
    expect(result.month.month).toBe(before.getUTCMonth() + 1);
  });

  it("summarizes the caller-provided window with the journal's visibility rule", async () => {
    mockJournalRepo.sumLinesByAccount.mockResolvedValue([
      { accountId: "acc-food", _sum: { debit: 100, credit: 0 } },
    ]);

    const from = new Date(Date.UTC(2025, 11, 1));
    const to = new Date(Date.UTC(2025, 12, 0, 23, 59, 59, 999));
    const result = await dashboard("led-1", "viewer", new Date(), {
      from,
      to,
    });

    // Not flag equality: `activityVisibility` keeps opted-out guest posts
    // counted — the same rule the journal list shows them by.
    expect(mockJournalRepo.sumLinesByAccount).toHaveBeenCalledWith("led-1", {
      from,
      to,
      activityVisibility: true,
    });
    expect(result.month.year).toBe(2025);
    expect(result.month.month).toBe(12);
    expect(result.month.totalExpense).toBe(100);
    expect(result.month.totalIncome).toBe(0);
    expect(result.month.net).toBe(-100);
  });

  it("counts every entry in full (all members' shares) while net worth stays all-time", async () => {
    mockJournalRepo.sumLinesByAccount.mockImplementation(
      async (_ledgerId: string, window?: { activityVisibility?: boolean }) =>
        // No visibility flag = the all-time net-worth sum; flagged = the
        // month statement. A shared 100 expense counts in full even though
        // the caller is only one of the two participants.
        window?.activityVisibility
          ? [{ accountId: "acc-food", _sum: { debit: 100, credit: 0 } }]
          : [{ accountId: "acc-pocket", _sum: { debit: 0, credit: 100 } }],
    );

    const result = await dashboard("led-1");

    // Net worth: unfiltered gross (accounting truth — the money moved).
    expect(mockJournalRepo.sumLinesByAccount).toHaveBeenCalledWith("led-1", {});
    expect(result.assets).toBe(-100);
    // Month statement: the entry's full value, not the caller's share.
    expect(monthWindowCall()).toMatchObject({ activityVisibility: true });
    expect(result.month.totalExpense).toBe(100);
    // Recent entries mirror the journal activity: member entries the creator
    // kept in plus every guest post (every entry feeding the statement stays
    // visible at the top of the dashboard too).
    expect(mockJournalRepo.listRecent).toHaveBeenCalledWith("led-1", 5);
  });
});

describe("trialBalance", () => {
  it("stays accounting-true: sums every entry regardless of flags", async () => {
    const { trialBalance } = await import("../report.service");

    await trialBalance("led-1");
    expect(mockJournalRepo.sumLinesByAccount).toHaveBeenCalledWith("led-1", {});
  });
});

describe("memberTurnover", () => {
  it("includes virtual members like any other member and names project outsiders", async () => {
    // A virtual member is an ordinary roster row to the turnover math —
    // its flags never filter it out of stats.
    mockMemberRepo.listByLedger.mockResolvedValue([
      {
        id: "m-a",
        userId: "user-a",
        role: "owner",
        createdAt: new Date(),
        user: { id: "user-a", name: "A", email: null, avatar: null, flags: [] },
      },
      {
        id: "m-v",
        userId: "user-v",
        role: "viewer",
        createdAt: new Date(),
        user: {
          id: "user-v",
          name: "小明",
          email: null,
          avatar: null,
          flags: ["virtual"],
        },
      },
    ]);
    mockProjectMemberRepo.listUsersInLedger.mockResolvedValue([
      { userId: "user-out", user: { name: "小外", avatar: null } },
    ]);
    mockJournalRepo.listTaggedEntries.mockResolvedValue([
      {
        lines: [
          { debit: 30, credit: 0 },
          { debit: 0, credit: 30 },
        ],
        participants: [
          { userId: "user-a" },
          { userId: "user-v" },
          { userId: "user-out" },
        ],
      },
    ]);

    const { members, totals } = await memberTurnover("led-1");

    expect(members.find((m) => m.userId === "user-v")).toMatchObject({
      ledgerMemberId: "m-v",
      name: "小明",
      role: "viewer",
      entryCount: 1,
      turnover: 30,
    });
    expect(members.find((m) => m.userId === "user-a")).toMatchObject({
      entryCount: 1,
      turnover: 30,
    });
    // A project outsider (no ledger row) resolves their identity through
    // the project membership and maps to the guest role.
    expect(members.find((m) => m.userId === "user-out")).toMatchObject({
      ledgerMemberId: null,
      name: "小外",
      role: "guest",
      entryCount: 1,
      turnover: 30,
    });
    expect(totals).toEqual({ entries: 1, turnover: 90 });
  });
});
