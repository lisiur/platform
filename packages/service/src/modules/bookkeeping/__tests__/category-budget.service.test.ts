import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/db", () => ({ prisma: {} }));

vi.mock("../ledger.repository", () => ({
  ledgerRepository: { findById: vi.fn() },
}));

vi.mock("../account.repository", () => ({
  accountRepository: { listByLedger: vi.fn() },
}));

vi.mock("../category-budget.repository", () => ({
  categoryBudgetRepository: {
    listByYear: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../journal.repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../journal.repository")>();
  return {
    journalRepository: { listActivityEntriesWithLines: vi.fn() },
    // The pure helpers the members-share summary re-uses — the real ones,
    // so side mapping and row ordering behave exactly as shipped.
    categorySideOf: actual.categorySideOf,
    orderCategoryRows: actual.orderCategoryRows,
  };
});

vi.mock("../ledger-member.repository", () => ({
  ledgerMemberRepository: { listByLedger: vi.fn() },
}));

import { accountRepository } from "../account.repository";
import { categoryBudgetRepository } from "../category-budget.repository";
import {
  buildCategoryBudgetReport,
  deleteCategoryBudget,
  getCategoryBudgets,
  rollUpCategorySums,
  upsertCategoryBudget,
} from "../category-budget.service";
import { journalRepository } from "../journal.repository";
import { ledgerRepository } from "../ledger.repository";
import { ledgerMemberRepository } from "../ledger-member.repository";

const OFFSET = 480;

/** A chart node: id, parent edge, and the report's display ordering. */
function account(id: string, parentId: string | null, sortOrder = 0) {
  return { id, parentId, sortOrder };
}

describe("rollUpCategorySums", () => {
  // 餐饮(parent) ← 食材(child) ← 零食(grandchild), plus a sibling 树.
  const chart = [
    account("food", null, 0),
    account("groceries", "food", 1),
    account("snacks", "groceries", 2),
    account("transport", null, 3),
    account("taxi", "transport", 4),
  ];

  it("rolls each row's subtree up including itself", () => {
    const sums = new Map([
      ["food", 100],
      ["groceries", 200],
      ["snacks", 400],
    ]);
    const rows = rollUpCategorySums(chart, sums, ["groceries", "food"]);
    expect(rows).toEqual([
      { accountId: "groceries", spentCents: 600 },
      { accountId: "food", spentCents: 700 },
    ]);
  });

  it("keeps parent and child rows intentionally overlapping", () => {
    // 父子重叠允许: the parent's figure contains the child's — both rows
    // stay as the user pinned them, no de-duplication.
    const sums = new Map([["snacks", 900]]);
    const rows = rollUpCategorySums(chart, sums, [
      "snacks",
      "groceries",
      "food",
    ]);
    expect(rows.map((row) => row.spentCents)).toEqual([900, 900, 900]);
  });

  it("counts lines posted directly on a non-leaf category", () => {
    // Subtree-including-self semantics: a parent's own lines are never
    // dropped, only a leaves-only walk would lose them.
    const sums = new Map([
      ["food", 500],
      ["taxi", 300],
    ]);
    const rows = rollUpCategorySums(chart, sums, ["food", "transport"]);
    expect(rows.map((row) => row.spentCents)).toEqual([500, 300]);
  });

  it("reports 0 for a zero-consumption category", () => {
    const rows = rollUpCategorySums(chart, new Map(), ["food"]);
    expect(rows).toEqual([{ accountId: "food", spentCents: 0 }]);
  });

  it("survives a data cycle without hanging", () => {
    const cyclic = [account("a", "b"), account("b", "a"), account("c", null)];
    const sums = new Map([
      ["a", 10],
      ["b", 20],
      ["c", 40],
    ]);
    const rows = rollUpCategorySums(cyclic, sums, ["a", "c"]);
    expect(rows).toEqual([
      { accountId: "a", spentCents: 30 },
      { accountId: "c", spentCents: 40 },
    ]);
  });

  it("resolves an id missing from the chart to its own sum alone", () => {
    // Unreachable through the API (the row cascades with its account) but
    // the pure function stays total.
    const sums = new Map([["ghost", 70]]);
    const rows = rollUpCategorySums(chart, sums, ["ghost"]);
    expect(rows).toEqual([{ accountId: "ghost", spentCents: 70 }]);
  });
});

describe("getCategoryBudgets", () => {
  const mockLedgerRepo = ledgerRepository as unknown as {
    findById: ReturnType<typeof vi.fn>;
  };
  const mockRepo = categoryBudgetRepository as unknown as {
    listByYear: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "active",
    });
  });

  it("returns the year's rows plus the previous year's carryOver", async () => {
    mockRepo.listByYear.mockImplementation((_ledgerId: string, year: number) =>
      year === 2026
        ? Promise.resolve([
            { accountId: "acc-food", cents: 100_000 },
            { accountId: "acc-taxi", cents: 50_000 },
          ])
        : Promise.resolve([{ accountId: "acc-food", cents: 80_000 }]),
    );
    const settings = await getCategoryBudgets("led-1", 2026);
    expect(mockRepo.listByYear).toHaveBeenCalledWith("led-1", 2025);
    expect(settings).toEqual({
      year: 2026,
      categories: [
        { accountId: "acc-food", cents: 100_000 },
        { accountId: "acc-taxi", cents: 50_000 },
      ],
      carryOver: [{ accountId: "acc-food", cents: 80_000 }],
    });
  });

  it("404s an unknown ledger before any read", async () => {
    mockLedgerRepo.findById.mockResolvedValue(null);
    await expect(getCategoryBudgets("led-1", 2026)).rejects.toMatchObject({
      status: 404,
    });
    expect(mockRepo.listByYear).not.toHaveBeenCalled();
  });
});

describe("upsertCategoryBudget / deleteCategoryBudget", () => {
  const mockLedgerRepo = ledgerRepository as unknown as {
    findById: ReturnType<typeof vi.fn>;
  };
  const mockAccountRepo = accountRepository as unknown as {
    listByLedger: ReturnType<typeof vi.fn>;
  };
  const mockRepo = categoryBudgetRepository as unknown as {
    listByYear: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "active",
    });
    mockAccountRepo.listByLedger.mockResolvedValue([
      { id: "acc-food", type: "expense" },
      { id: "acc-cash", type: "asset" },
    ]);
    mockRepo.listByYear.mockImplementation((_ledgerId: string, year: number) =>
      year === 2026
        ? Promise.resolve([{ accountId: "acc-food", cents: 100_000 }])
        : Promise.resolve([]),
    );
  });

  it("writes the upsert and returns the fresh settings", async () => {
    const settings = await upsertCategoryBudget(
      "led-1",
      2026,
      "acc-food",
      100_000,
    );
    expect(mockRepo.upsert).toHaveBeenCalledWith("led-1", {
      year: 2026,
      accountId: "acc-food",
      cents: 100_000,
    });
    expect(settings).toEqual({
      year: 2026,
      categories: [{ accountId: "acc-food", cents: 100_000 }],
      carryOver: [],
    });
  });

  it("rejects a non-expense category without writing", async () => {
    await expect(
      upsertCategoryBudget("led-1", 2026, "acc-cash", 100),
    ).rejects.toMatchObject({ status: 400 });
    expect(mockRepo.upsert).not.toHaveBeenCalled();
  });

  it("refuses an archived ledger before writing", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "archived",
    });
    await expect(
      upsertCategoryBudget("led-1", 2026, "acc-food", 100),
    ).rejects.toMatchObject({ status: 400 });
    expect(mockRepo.upsert).not.toHaveBeenCalled();
  });

  it("deletes idempotently and still returns the fresh settings", async () => {
    mockRepo.delete.mockResolvedValue({ count: 0 });
    const settings = await deleteCategoryBudget("led-1", 2026, "acc-food");
    expect(mockRepo.delete).toHaveBeenCalledWith("led-1", {
      year: 2026,
      accountId: "acc-food",
    });
    expect(settings.year).toBe(2026);
  });
});

describe("buildCategoryBudgetReport", () => {
  const mockLedgerRepo = ledgerRepository as unknown as {
    findById: ReturnType<typeof vi.fn>;
  };
  const mockAccountRepo = accountRepository as unknown as {
    listByLedger: ReturnType<typeof vi.fn>;
  };
  const mockRepo = categoryBudgetRepository as unknown as {
    listByYear: ReturnType<typeof vi.fn>;
  };
  const mockJournalRepo = journalRepository as unknown as {
    listActivityEntriesWithLines: ReturnType<typeof vi.fn>;
  };
  const mockMemberRepo = ledgerMemberRepository as unknown as {
    listByLedger: ReturnType<typeof vi.fn>;
  };

  const chart = [
    {
      ...account("acc-food", null, 10),
      name: "餐饮",
      code: "food",
      icon: "🍜",
    },
    {
      ...account("acc-groceries", "acc-food", 20),
      name: null,
      code: "groceries",
      icon: null,
    },
    {
      ...account("acc-taxi", null, 30),
      name: "打车",
      code: "taxi",
      icon: "🚕",
    },
  ];

  /** One activity entry: debit stands in for Prisma Decimal (yuan scale),
   *  and every line's account mirrors the repository's select shape. */
  function entry(input: {
    paidById: string | null;
    participants: string[];
    lines: Array<{ accountId: string; debit: number; type?: string }>;
  }) {
    return {
      date: new Date("2026-03-01T00:00:00.000Z"),
      paidById: input.paidById,
      participants: input.participants.map((userId) => ({ userId })),
      lines: input.lines.map((line) => ({
        accountId: line.accountId,
        debit: line.debit,
        credit: 0,
        account: {
          id: line.accountId,
          name: null,
          code: null,
          type: line.type ?? "expense",
          icon: null,
          parent: null,
        },
      })),
    };
  }

  beforeEach(() => {
    vi.resetAllMocks();
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "active",
      currency: "CNY",
    });
    mockAccountRepo.listByLedger.mockResolvedValue(chart);
    mockRepo.listByYear.mockResolvedValue([
      { accountId: "acc-taxi", cents: 50_000 },
      { accountId: "acc-food", cents: 120_000 },
    ]);
    mockMemberRepo.listByLedger.mockResolvedValue([
      { userId: "u-alice" },
      { userId: "u-bob" },
    ]);
    mockJournalRepo.listActivityEntriesWithLines.mockResolvedValue([]);
  });

  it("early-exits an empty year without touching the journal", async () => {
    mockRepo.listByYear.mockResolvedValue([]);
    const report = await buildCategoryBudgetReport("led-1", 2026, OFFSET);
    expect(report).toEqual({
      year: 2026,
      currency: "CNY",
      categories: [],
    });
    expect(mockJournalRepo.listActivityEntriesWithLines).not.toHaveBeenCalled();
  });

  it("windows the whole local year over the activity entries", async () => {
    await buildCategoryBudgetReport("led-1", 2026, OFFSET);
    const [ledgerId, window] = mockJournalRepo.listActivityEntriesWithLines.mock
      .calls[0] as [string, { from: Date; to: Date }];
    expect(ledgerId).toBe("led-1");
    // January 1st through December 31st of the offset's local year. No
    // includeExcluded — the default activity predicate applies, the
    // members-share caliber.
    expect(window.from.toISOString()).toBe("2025-12-31T16:00:00.000Z");
    expect(window.to.toISOString()).toBe("2026-12-31T15:59:59.999Z");
  });

  it("counts only the tagged members' slices and joins the roll-up", async () => {
    mockJournalRepo.listActivityEntriesWithLines.mockResolvedValue([
      // A member's untagged personal entry: the payer bears it all.
      entry({
        paidById: "u-alice",
        participants: [],
        lines: [{ accountId: "acc-food", debit: 100 }],
      }),
      // A guest post tagging both members: both slices count in full.
      entry({
        paidById: "u-guest",
        participants: ["u-alice", "u-bob"],
        lines: [{ accountId: "acc-taxi", debit: 60 }],
      }),
      // A guest post tagging one member and one outsider: only the
      // member's half lands.
      entry({
        paidById: "u-guest",
        participants: ["u-alice", "u-outsider"],
        lines: [{ accountId: "acc-groceries", debit: 90 }],
      }),
      // An untagged outsider-paid guest post: the payer fallback credits
      // nobody on the roster — nothing counts.
      entry({
        paidById: "u-outsider",
        participants: [],
        lines: [{ accountId: "acc-food", debit: 50 }],
      }),
    ]);
    const report = await buildCategoryBudgetReport("led-1", 2026, OFFSET);
    // 餐饮: 10000 (Alice's own entry) + 0 (the outsider-paid post); 食材's
    // 4500 rolls up into it → 14500. 打车: 3000 + 3000 = 6000. The rows
    // sort by the chart's sortOrder, not the budget rows' storage order.
    expect(report.categories).toEqual([
      {
        accountId: "acc-food",
        name: "餐饮",
        code: "food",
        icon: "🍜",
        budgetCents: 120_000,
        spentCents: 14_500,
      },
      {
        accountId: "acc-taxi",
        name: "打车",
        code: "taxi",
        icon: "🚕",
        budgetCents: 50_000,
        spentCents: 6_000,
      },
    ]);
  });

  it("reports 0 spent for a category with no recorded activity", async () => {
    mockJournalRepo.listActivityEntriesWithLines.mockResolvedValue([]);
    const report = await buildCategoryBudgetReport("led-1", 2026, OFFSET);
    expect(report.categories.map((row) => row.spentCents)).toEqual([0, 0]);
  });
});
