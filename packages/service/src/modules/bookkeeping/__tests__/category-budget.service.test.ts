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

vi.mock("../journal.repository", () => ({
  journalRepository: { sumLinesByCategory: vi.fn() },
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

const OFFSET = 480;

/** A chart node: id, parent edge, and the report's display ordering. */
function account(id: string, parentId: string | null, sortOrder = 0) {
  return { id, parentId, sortOrder };
}

/** The expense bucket rows `sumLinesByCategory` returns. */
function spent(accountId: string, amountCents: number) {
  return { accountId, amountCents };
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
    sumLinesByCategory: ReturnType<typeof vi.fn>;
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
    mockJournalRepo.sumLinesByCategory.mockResolvedValue({
      expense: [
        spent("acc-food", 30_000),
        spent("acc-groceries", 40_000),
        spent("acc-taxi", 10_000),
      ],
      income: [],
    });
  });

  it("early-exits an empty year without touching the journal", async () => {
    mockRepo.listByYear.mockResolvedValue([]);
    const report = await buildCategoryBudgetReport("led-1", 2026, OFFSET);
    expect(report).toEqual({
      year: 2026,
      currency: "CNY",
      categories: [],
    });
    expect(mockJournalRepo.sumLinesByCategory).not.toHaveBeenCalled();
  });

  it("windows the whole local year and counts every recorded cent", async () => {
    await buildCategoryBudgetReport("led-1", 2026, OFFSET);
    const [ledgerId, window] = mockJournalRepo.sumLinesByCategory.mock
      .calls[0] as [string, { from: Date; to: Date; includeExcluded: boolean }];
    expect(ledgerId).toBe("led-1");
    // January 1st through December 31st of the offset's local year.
    expect(window.from.toISOString()).toBe("2025-12-31T16:00:00.000Z");
    expect(window.to.toISOString()).toBe("2026-12-31T15:59:59.999Z");
    // The spent口径 counts countsInLedger opt-outs — the default predicate
    // would drop them; the flag must ride along.
    expect(window.includeExcluded).toBe(true);
  });

  it("joins roll-up onto budget rows and orders by chart sortOrder", async () => {
    const report = await buildCategoryBudgetReport("led-1", 2026, OFFSET);
    // 食材's 40000 rolls up into 餐饮's 30000 → 70000; the rows sort by
    // the chart's sortOrder, not the budget rows' storage order.
    expect(report.categories).toEqual([
      {
        accountId: "acc-food",
        name: "餐饮",
        code: "food",
        icon: "🍜",
        budgetCents: 120_000,
        spentCents: 70_000,
      },
      {
        accountId: "acc-taxi",
        name: "打车",
        code: "taxi",
        icon: "🚕",
        budgetCents: 50_000,
        spentCents: 10_000,
      },
    ]);
  });

  it("reports 0 spent for a category with no recorded activity", async () => {
    mockJournalRepo.sumLinesByCategory.mockResolvedValue({
      expense: [],
      income: [],
    });
    const report = await buildCategoryBudgetReport("led-1", 2026, OFFSET);
    expect(report.categories.map((row) => row.spentCents)).toEqual([0, 0]);
  });
});
