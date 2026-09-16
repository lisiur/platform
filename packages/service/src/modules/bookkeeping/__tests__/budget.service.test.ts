import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/db", () => ({ prisma: {} }));

vi.mock("../ledger.repository", () => ({
  ledgerRepository: { findById: vi.fn() },
}));

vi.mock("../account.repository", () => ({
  accountRepository: { listByLedger: vi.fn() },
}));

vi.mock("../budget.repository", () => ({
  budgetRepository: {
    findYear: vi.fn(),
    setExcludedAccountIds: vi.fn(),
  },
}));

import { accountRepository } from "../account.repository";
import { budgetRepository } from "../budget.repository";
import {
  aggregateBudgetMonths,
  type BudgetActivityRow,
  buildBudgetYear,
  firstActivityMonth,
  monthIndexOf,
  monthWindow,
  resolveMonthBudgetCents,
  setExcludedCategories,
  toBudgetActivityRows,
  yearIndexOf,
} from "../budget.service";
import { ledgerRepository } from "../ledger.repository";

/** An instant that reads as the given wall-clock date in UTC+8 (the
 *  offset every test uses), so month bucketing is readable in the specs. */
function localDate(year: number, month: number, day: number, hour = 12): Date {
  return new Date(Date.UTC(year, month - 1, day, hour - 8));
}

const OFFSET = 480;

function activity(
  year: number,
  month: number,
  countedCents: number,
  excludedCents = 0,
): BudgetActivityRow {
  return {
    date: localDate(year, month, 15),
    expenseCents: countedCents + excludedCents,
    excludedCents,
  };
}

describe("monthWindow", () => {
  it("computes the local month bounds for a positive UTC offset", () => {
    const window = monthWindow(2026, 9, OFFSET);
    expect(window.from.toISOString()).toBe("2026-08-31T16:00:00.000Z");
    expect(window.to.toISOString()).toBe("2026-09-30T15:59:59.999Z");
  });

  it("rolls December's window into the next year without special cases", () => {
    const window = monthWindow(2026, 12, OFFSET);
    expect(window.to.toISOString()).toBe("2026-12-31T15:59:59.999Z");
    // The exclusive next-month start lands on local New Year's Day.
    const next = new Date(window.to.getTime() + 1);
    expect(yearIndexOf(next, OFFSET)).toBe(2027);
    expect(monthIndexOf(next, OFFSET)).toBe(1);
  });
});

describe("bucketing indexes", () => {
  it("maps instants near a month boundary to the local month", () => {
    // 2026-09-01 01:00 +08 == 2026-08-31T17:00Z — the dashboard's classic
    // UTC mislabel; the offset bucketing must read September.
    expect(monthIndexOf(new Date("2026-08-31T17:00:00.000Z"), OFFSET)).toBe(9);
    expect(yearIndexOf(new Date("2026-08-31T17:00:00.000Z"), OFFSET)).toBe(
      2026,
    );
    // And the year boundary: local 2027-01-01 == 2026-12-31T16:00Z.
    expect(monthIndexOf(new Date("2026-12-31T16:30:00.000Z"), OFFSET)).toBe(1);
    expect(yearIndexOf(new Date("2026-12-31T16:30:00.000Z"), OFFSET)).toBe(
      2027,
    );
  });
});

describe("aggregateBudgetMonths", () => {
  it("splits each month's activity into the counted and excluded pools", () => {
    const map = aggregateBudgetMonths(
      [
        activity(2026, 3, 100_00),
        activity(2026, 3, 50_00, 3_000_00),
        activity(2026, 4, 80_00),
      ],
      OFFSET,
      2026,
    );
    expect(map.get(3)).toEqual({
      countedCents: 150_00,
      excludedCents: 3_000_00,
    });
    expect(map.get(4)?.countedCents).toBe(80_00);
  });

  it("ignores entries outside the anchor year", () => {
    const map = aggregateBudgetMonths(
      [activity(2025, 12, 10_00), activity(2027, 1, 10_00)],
      OFFSET,
      2026,
    );
    expect(map.size).toBe(0);
  });
});

describe("firstActivityMonth", () => {
  it("returns the earliest recorded month of the year", () => {
    expect(
      firstActivityMonth(
        [activity(2026, 6, 100), activity(2026, 8, 100)],
        OFFSET,
        2026,
      ),
    ).toBe(6);
  });

  it("returns null when the year has no recorded activity", () => {
    expect(
      firstActivityMonth([activity(2025, 3, 100)], OFFSET, 2026),
    ).toBeNull();
  });
});

describe("resolveMonthBudgetCents", () => {
  it("prefers the month's own override over the year amount", () => {
    const overrides = new Map([[12, 800_000]]);
    expect(resolveMonthBudgetCents(500_000, overrides, 12)).toBe(800_000);
    // Months without a pin fall back to the year's monthly amount.
    expect(resolveMonthBudgetCents(500_000, overrides, 11)).toBe(500_000);
  });

  it("is null only when the year has no budget row", () => {
    expect(resolveMonthBudgetCents(null, new Map(), 6)).toBeNull();
    // An override without a year amount resolves to itself — unreachable
    // through the API (overrides require the year row) but safe.
    expect(resolveMonthBudgetCents(null, new Map([[6, 400_000]]), 6)).toBe(
      400_000,
    );
  });
});

describe("buildBudgetYear", () => {
  const YEAR = 500_000;
  const noOverrides = new Map<number, number>();

  it("nets surpluses against overspends and skips the anchor month", () => {
    // Acceptance #7: 3月超支500、4月结余200、5月超支300 → 6月看 +600。
    const rows = [
      activity(2026, 3, 550_000),
      activity(2026, 4, 480_000),
      activity(2026, 5, 530_000),
      // The anchor month itself never participates…
      activity(2026, 6, 999_999),
    ];
    const year = buildBudgetYear(rows, YEAR, noOverrides, 2026, 6, OFFSET);
    expect(year).not.toBeNull();
    expect(year?.startMonth).toBe(3);
    expect(year?.rows.map((row) => [row.month, row.diffCents])).toEqual([
      [3, 50_000],
      [4, -20_000],
      [5, 30_000],
    ]);
    expect(year?.netCents).toBe(60_000);
  });

  it("reports a negative net when surpluses outweigh overspends", () => {
    // Acceptance #8: 3月超支500、4月结余800 → 5月看 -300。
    const year = buildBudgetYear(
      [activity(2026, 3, 550_000), activity(2026, 4, 420_000)],
      YEAR,
      noOverrides,
      2026,
      5,
      OFFSET,
    );
    expect(year?.netCents).toBe(-30_000);
  });

  it("retroactively budgets recorded months and honors single-month overrides", () => {
    // Acceptance #10: the year amount covers EVERY recorded month of the
    // year — resolution reads no dates, so June (recorded long before the
    // budget existed) is budgeted exactly like October. The pinned October
    // override replaces the year amount for that month alone.
    const overrides = new Map([[10, 800_000]]);
    const year = buildBudgetYear(
      [
        activity(2026, 6, 400_000),
        activity(2026, 8, 610_000),
        // Exactly on budget, so the diff isolates the effective amounts.
        activity(2026, 9, 500_000),
        activity(2026, 10, 800_000),
      ],
      YEAR,
      overrides,
      2026,
      11,
      OFFSET,
    );
    expect(
      year?.rows.map((row) => [row.month, row.budgetCents, row.diffCents]),
    ).toEqual([
      [6, 500_000, -100_000],
      [8, 500_000, 110_000],
      [9, 500_000, 0],
      [10, 800_000, 0],
    ]);
  });

  it("treats a month whose spending is fully excluded as a surplus", () => {
    const year = buildBudgetYear(
      [activity(2026, 3, 0, 3_000_00)],
      YEAR,
      noOverrides,
      2026,
      4,
      OFFSET,
    );
    expect(year?.rows).toEqual([
      {
        year: 2026,
        month: 3,
        budgetCents: 500_000,
        countedCents: 0,
        diffCents: -500_000,
      },
    ]);
  });

  it("returns null for a year without recorded activity or without a budget row", () => {
    expect(buildBudgetYear([], YEAR, noOverrides, 2026, 9, OFFSET)).toBeNull();
    expect(
      buildBudgetYear(
        [activity(2026, 3, 100)],
        null,
        noOverrides,
        2026,
        9,
        OFFSET,
      ),
    ).toBeNull();
  });
});

describe("toBudgetActivityRows", () => {
  it("sums expense lines into the pools by the entry's budget flag", () => {
    const rows = toBudgetActivityRows([
      {
        date: localDate(2026, 3, 2),
        excludedFromBudget: false,
        lines: [
          { debit: 100, credit: 0, account: { type: "expense" } },
          { debit: 0, credit: 100, account: { type: "asset" } },
        ],
      },
      {
        date: localDate(2026, 3, 3),
        excludedFromBudget: true,
        lines: [{ debit: 3000, credit: 0, account: { type: "expense" } }],
      },
      {
        date: localDate(2026, 3, 4),
        excludedFromBudget: false,
        lines: [{ debit: 0, credit: 5000, account: { type: "income" } }],
      },
    ]);
    expect(rows).toEqual([
      { date: localDate(2026, 3, 2), expenseCents: 100_00, excludedCents: 0 },
      {
        date: localDate(2026, 3, 3),
        expenseCents: 3_000_00,
        excludedCents: 3_000_00,
      },
      { date: localDate(2026, 3, 4), expenseCents: 0, excludedCents: 0 },
    ]);
  });
});

describe("setExcludedCategories response echo", () => {
  const mockLedgerRepo = ledgerRepository as unknown as {
    findById: ReturnType<typeof vi.fn>;
  };
  const mockAccountRepo = accountRepository as unknown as {
    listByLedger: ReturnType<typeof vi.fn>;
  };
  const mockBudgetRepo = budgetRepository as unknown as {
    findYear: ReturnType<typeof vi.fn>;
    setExcludedAccountIds: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.resetAllMocks();
    // The pre-write snapshot carries a DIFFERENT list than the update's
    // return — the response must read the latter.
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      status: "active",
      budgetExcludedAccountIds: ["stale"],
    });
    mockAccountRepo.listByLedger.mockResolvedValue([
      { id: "acc-food", type: "expense" },
      { id: "acc-meals", type: "expense" },
      { id: "acc-cash", type: "asset" },
    ]);
    mockBudgetRepo.setExcludedAccountIds.mockResolvedValue({
      id: "led-1",
      status: "active",
      budgetExcludedAccountIds: ["acc-food", "acc-meals"],
    });
    mockBudgetRepo.findYear.mockResolvedValue(null);
  });

  it("returns the UPDATED exclusion list, not the pre-write snapshot", async () => {
    const settings = await setExcludedCategories("led-1", 2026, [
      "acc-food",
      "acc-meals",
    ]);
    expect(mockBudgetRepo.setExcludedAccountIds).toHaveBeenCalledWith("led-1", [
      "acc-food",
      "acc-meals",
    ]);
    expect(settings.excludedAccountIds).toEqual(["acc-food", "acc-meals"]);
  });

  it("rejects non-expense categories without writing", async () => {
    await expect(
      setExcludedCategories("led-1", 2026, ["acc-cash"]),
    ).rejects.toMatchObject({ status: 400 });
    expect(mockBudgetRepo.setExcludedAccountIds).not.toHaveBeenCalled();
  });
});
