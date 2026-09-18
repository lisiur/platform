import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/db", () => ({
  prisma: {},
}));

vi.mock("../account.repository", () => ({
  accountRepository: {
    listByLedger: vi.fn(),
  },
}));

vi.mock("../journal.repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../journal.repository")>();
  return {
    journalRepository: {
      listRecent: vi.fn(),
      sumLinesByAccount: vi.fn(),
      sumLinesByDay: vi.fn(),
      sumLinesByCategory: vi.fn(),
      listShareEntries: vi.fn(),
      listActivityEntries: vi.fn(),
      listActivityEntriesWithLines: vi.fn(),
      listTaggedEntries: vi.fn(),
    },
    // The pure aggregation helpers report.service re-uses for the
    // share-based stat paths — the real ones, so day bucketing, side
    // mapping, and row ordering behave exactly as shipped.
    categorySideOf: actual.categorySideOf,
    localDayKey: actual.localDayKey,
    orderCategoryRows: actual.orderCategoryRows,
  };
});

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
import {
  categorySummary,
  dailySummary,
  dashboard,
  incomeStatement,
  memberTurnover,
} from "../report.service";

const mockAccountRepo = accountRepository as unknown as {
  listByLedger: ReturnType<typeof vi.fn>;
};
const mockJournalRepo = journalRepository as unknown as {
  listRecent: ReturnType<typeof vi.fn>;
  sumLinesByAccount: ReturnType<typeof vi.fn>;
  sumLinesByDay: ReturnType<typeof vi.fn>;
  sumLinesByCategory: ReturnType<typeof vi.fn>;
  listShareEntries: ReturnType<typeof vi.fn>;
  listActivityEntries: ReturnType<typeof vi.fn>;
  listActivityEntriesWithLines: ReturnType<typeof vi.fn>;
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
    // Explicit null must survive: a missing payer is its own test case.
    paidById: overrides.paidById !== undefined ? overrides.paidById : "user-a",
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
  mockJournalRepo.sumLinesByDay.mockResolvedValue([]);
  mockJournalRepo.sumLinesByCategory.mockResolvedValue({
    expense: [],
    income: [],
  });
  mockJournalRepo.listShareEntries.mockResolvedValue([]);
  mockJournalRepo.listActivityEntries.mockResolvedValue([]);
  mockJournalRepo.listActivityEntriesWithLines.mockResolvedValue([]);
  // The dashboard's member set: who counts as "family" in the split.
  mockMemberRepo.listByLedger.mockResolvedValue([
    { id: "m-a", userId: "user-a", role: "owner" },
    { id: "m-b", userId: "user-b", role: "editor" },
  ]);
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
  it("defaults to the month containing now", async () => {
    const before = new Date();

    const result = await dashboard("led-1");

    // Net worth stays the all-time sum; the month statement gets the window.
    expect(mockJournalRepo.sumLinesByAccount).toHaveBeenCalledWith("led-1", {});
    const window = mockJournalRepo.listActivityEntries.mock.calls[0]?.[1] as {
      from?: Date;
    };
    expect(window?.from?.getUTCMonth()).toBe(before.getUTCMonth());
    expect(window?.from?.getUTCFullYear()).toBe(before.getUTCFullYear());
    expect(window?.from?.getUTCDate()).toBe(1);
    expect(result.month.year).toBe(before.getUTCFullYear());
    expect(result.month.month).toBe(before.getUTCMonth() + 1);
  });

  it("summarizes the caller-provided window at the members' shares", async () => {
    mockJournalRepo.listActivityEntries.mockResolvedValue([
      // 100 split across two roster members: both slices count, so the
      // entry lands in full.
      shareEntry({
        lines: [{ accountId: "acc-food", debit: 100, credit: 0 }],
        participants: ["user-a", "user-b"],
      }),
    ]);

    const from = new Date(Date.UTC(2025, 11, 1));
    const to = new Date(Date.UTC(2025, 12, 0, 23, 59, 59, 999));
    const result = await dashboard("led-1", "viewer", new Date(), {
      from,
      to,
    });

    expect(mockJournalRepo.listActivityEntries).toHaveBeenCalledWith("led-1", {
      from,
      to,
    });
    expect(result.month.year).toBe(2025);
    expect(result.month.month).toBe(12);
    expect(result.month.totalExpense).toBe(100);
    expect(result.month.totalIncome).toBe(0);
    expect(result.month.net).toBe(-100);
  });

  it("drops project outsiders' slices from the split while net worth stays all-time", async () => {
    // The beforeEach roster knows only user-a/user-b — "user-out" and
    // "user-guest" hold no ledger row.
    mockJournalRepo.listActivityEntries.mockResolvedValue([
      // 100 across two members and one outsider: only the members' slices
      // count (33.34 + 33.33).
      shareEntry({
        lines: [{ accountId: "acc-food", debit: 100, credit: 0 }],
        participants: ["user-a", "user-b", "user-out"],
      }),
      // An outsiders-only entry: not the family's expense at all.
      shareEntry({
        paidById: "user-out",
        lines: [{ accountId: "acc-food", debit: 60, credit: 0 }],
        participants: ["user-out", "user-guest"],
      }),
      // An untagged outsider-paid legacy row: the payer alone bears it,
      // and the payer is no member.
      shareEntry({
        paidById: "user-out",
        lines: [{ accountId: "acc-food", debit: 40, credit: 0 }],
        participants: [],
      }),
      // An outsider fronted it, but a member shared the consumption: the
      // member's slice still counts.
      shareEntry({
        paidById: "user-out",
        lines: [{ accountId: "acc-food", debit: 60, credit: 0 }],
        participants: ["user-a", "user-out"],
      }),
      // An ownerless system entry (no payer, no participants): nothing to
      // attribute, contributes nothing.
      shareEntry({
        paidById: null,
        lines: [{ accountId: "acc-food", debit: 40, credit: 0 }],
        participants: [],
      }),
    ]);
    mockJournalRepo.sumLinesByAccount.mockResolvedValue([
      // The viewer fronted 100 out of the pocket in total.
      { accountId: "acc-pocket", _sum: { debit: 0, credit: 100 } },
    ]);

    const result = await dashboard("led-1");

    // Net worth: unfiltered gross (accounting truth — the money moved).
    expect(mockJournalRepo.sumLinesByAccount).toHaveBeenCalledWith("led-1", {});
    expect(result.assets).toBe(-100);
    // Month statement: the members' shares only — 33.34 + 33.33 from the
    // three-way split plus the member's 30 of the outsider-fronted entry;
    // the outsiders-only, outsider-paid-untagged, and ownerless entries
    // contribute nothing.
    expect(result.month.totalExpense).toBe(96.67);
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

/** A stat-path entry: the date the day bucketing reads and lines carrying
 *  the full account payload (id/name/code/parent), as
 *  `listActivityEntriesWithLines` returns them. Plain numbers stand in for
 *  Prisma Decimal. The member roster in beforeEach is user-a/user-b —
 *  user-out/user-guest hold no ledger row. */
function statEntry(
  overrides: {
    date?: Date;
    paidById?: string | null;
    lines?: Array<{
      accountId: string;
      name?: string | null;
      code?: string | null;
      parent?: { name: string | null; code: string | null } | null;
      debit: number;
      credit: number;
      type?: string;
    }>;
    participants?: string[];
  } = {},
) {
  return {
    date: overrides.date ?? new Date("2026-09-17T10:00:00Z"),
    paidById: overrides.paidById !== undefined ? overrides.paidById : "user-a",
    lines: (overrides.lines ?? []).map((line) => ({
      accountId: line.accountId,
      debit: line.debit,
      credit: line.credit,
      account: {
        id: line.accountId,
        name: line.name ?? null,
        code: line.code ?? null,
        type: line.type ?? "expense",
        parent: line.parent ?? null,
      },
    })),
    participants: (overrides.participants ?? ["user-a"]).map((userId) => ({
      userId,
    })),
  };
}

describe("dailySummary (shareMode=members)", () => {
  it("lands only the members' slices on the entry's LOCAL day", async () => {
    mockJournalRepo.listActivityEntriesWithLines.mockResolvedValue([
      // ¥100 across a member and an outsider, dated 20:00 UTC — UTC+8
      // buckets it on the 18th, and only the member's ¥50 lands.
      statEntry({
        date: new Date("2026-09-17T20:00:00Z"),
        lines: [{ accountId: "acc-food", debit: 100, credit: 0 }],
        participants: ["user-a", "user-out"],
      }),
    ]);

    const days = await dailySummary("led-1", { shareMode: "members" }, 480);

    expect(mockJournalRepo.listActivityEntriesWithLines).toHaveBeenCalledWith(
      "led-1",
      { shareMode: "members" },
    );
    expect(days).toEqual([
      { day: "2026-09-18", incomeCents: 0, expenseCents: 5000 },
    ]);
  });

  it("drops outsiders-only entries — they are not the family's spend", async () => {
    mockJournalRepo.listActivityEntriesWithLines.mockResolvedValue([
      statEntry({
        paidById: "user-out",
        lines: [{ accountId: "acc-food", debit: 60, credit: 0 }],
        participants: ["user-out", "user-guest"],
      }),
      statEntry({
        paidById: "user-out",
        lines: [{ accountId: "acc-food", debit: 40, credit: 0 }],
        participants: [],
      }),
    ]);

    const days = await dailySummary("led-1", { shareMode: "members" }, 0);

    expect(days).toEqual([]);
  });

  it("splits income and expense sides and skips transfer lines", async () => {
    mockJournalRepo.listActivityEntriesWithLines.mockResolvedValue([
      // Salary 90 shared by two members → both slices count, income 90;
      // food 60 untagged and member-paid → expense 60 in full; the pocket
      // transfer feeds neither.
      statEntry({
        paidById: "user-b",
        lines: [
          { accountId: "acc-salary", debit: 0, credit: 90, type: "income" },
        ],
        participants: ["user-a", "user-b"],
      }),
      statEntry({
        lines: [
          { accountId: "acc-food", debit: 60, credit: 0 },
          { accountId: "acc-pocket", debit: 60, credit: 0, type: "asset" },
        ],
        participants: [],
      }),
    ]);

    const days = await dailySummary("led-1", { shareMode: "members" }, 0);

    expect(days).toEqual([
      { day: "2026-09-17", incomeCents: 9000, expenseCents: 6000 },
    ]);
  });

  it("routes shareMode=line to the line-level aggregation", async () => {
    mockJournalRepo.sumLinesByDay.mockResolvedValue([
      { day: "2026-09-17", incomeCents: 0, expenseCents: 10000 },
    ]);

    const days = await dailySummary("led-1", { shareMode: "line" }, 480);

    expect(mockJournalRepo.listActivityEntriesWithLines).not.toHaveBeenCalled();
    expect(mockJournalRepo.sumLinesByDay).toHaveBeenCalledWith(
      "led-1",
      { shareMode: "line" },
      480,
    );
    expect(days).toEqual([
      { day: "2026-09-17", incomeCents: 0, expenseCents: 10000 },
    ]);
  });
});

describe("categorySummary (shareMode=members)", () => {
  it("aggregates member slices per account, carrying the parent pair", async () => {
    mockJournalRepo.listActivityEntriesWithLines.mockResolvedValue([
      // ¥100 across a member and an outsider → ¥50 of food counts.
      statEntry({
        lines: [
          {
            accountId: "acc-food",
            name: "Groceries",
            parent: { name: null, code: "food" },
            debit: 100,
            credit: 0,
          },
        ],
        participants: ["user-a", "user-out"],
      }),
      // ¥40 across two members → all of it counts, same account.
      statEntry({
        lines: [
          {
            accountId: "acc-food",
            name: "Groceries",
            parent: { name: null, code: "food" },
            debit: 40,
            credit: 0,
          },
        ],
        participants: ["user-a", "user-b"],
      }),
    ]);

    const summary = await categorySummary("led-1", { shareMode: "members" });

    expect(summary.expense).toEqual([
      {
        accountId: "acc-food",
        name: "Groceries",
        code: null,
        parentName: null,
        parentCode: "food",
        amountCents: 9000,
      },
    ]);
    expect(summary.income).toEqual([]);
  });

  it("omits accounts only outsiders' slices touched", async () => {
    mockJournalRepo.listActivityEntriesWithLines.mockResolvedValue([
      statEntry({
        paidById: "user-out",
        lines: [{ accountId: "acc-food", debit: 60, credit: 0 }],
        participants: ["user-out", "user-guest"],
      }),
      // A mixed entry still counts the member's slice of the SAME account.
      statEntry({
        lines: [
          { accountId: "acc-salary", debit: 0, credit: 80, type: "income" },
        ],
        participants: ["user-a", "user-out"],
      }),
    ]);

    const summary = await categorySummary("led-1", { shareMode: "members" });

    expect(summary.expense).toEqual([]);
    expect(summary.income.map((row) => row.accountId)).toEqual(["acc-salary"]);
    expect(summary.income[0].amountCents).toBe(4000);
  });

  it("routes shareMode=line to the line-level aggregation", async () => {
    mockJournalRepo.sumLinesByCategory.mockResolvedValue({
      expense: [],
      income: [],
    });

    const summary = await categorySummary("led-1", { shareMode: "line" });

    expect(mockJournalRepo.listActivityEntriesWithLines).not.toHaveBeenCalled();
    expect(mockJournalRepo.sumLinesByCategory).toHaveBeenCalledWith("led-1", {
      shareMode: "line",
    });
    expect(summary).toEqual({ expense: [], income: [] });
  });
});
