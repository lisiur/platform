import { describe, expect, it, vi } from "vitest";
import { Prisma } from "#generated/prisma/client";

vi.mock("#lib/db", () => ({
  prisma: {},
}));

import {
  categorySummaryFromLines,
  dailySummaryFromLines,
  entryFilterWhere,
  entryKindLines,
  journalRepository,
  orderByAmount,
} from "../journal.repository";

function row(
  entryId: string,
  sum: string | null,
  date: string,
  entryNo: number,
) {
  return {
    entryId,
    sum: sum === null ? null : new Prisma.Decimal(sum),
    date: new Date(date),
    entryNo,
  };
}

/** A transaction client whose `model`.findMany records its where — the
 *  aggregations' filter surface is `entryFilterWhere`'s output, so
 *  capturing the where (and the select) is the whole assertion surface.
 *  Shared by the day-summary, category-summary, and members-input
 *  describes (line aggregations read journalLine, the members-mode
 *  summary's input reads journalEntry). */
function capturingTx(model: "journalEntry" | "journalLine" = "journalLine") {
  const findMany = vi.fn().mockResolvedValue([]);
  return {
    findMany,
    tx: { [model]: { findMany } } as unknown as Prisma.TransactionClient,
  };
}

describe("orderByAmount", () => {
  it("orders descending by the summed line debits", () => {
    const rows = [
      row("a", "12.50", "2026-09-01", 1),
      row("b", "99.00", "2026-09-01", 2),
      row("c", "3.20", "2026-09-01", 3),
    ];
    expect(orderByAmount(rows, "desc").map((r) => r.entryId)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("orders ascending on request", () => {
    const rows = [
      row("a", "12.50", "2026-09-01", 1),
      row("b", "99.00", "2026-09-01", 2),
      row("c", "3.20", "2026-09-01", 3),
    ];
    expect(orderByAmount(rows, "asc").map((r) => r.entryId)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("compares as decimals, not strings or floats", () => {
    const rows = [
      row("a", "9.99", "2026-09-01", 1),
      row("b", "10.00", "2026-09-01", 2),
      row("c", "100.00", "2026-09-01", 3),
    ];
    expect(orderByAmount(rows, "desc").map((r) => r.entryId)).toEqual([
      "c",
      "b",
      "a",
    ]);
  });

  it("treats a null sum as zero, tie broken by entryNo descending", () => {
    const rows = [
      row("a", null, "2026-09-01", 1),
      row("b", "0.00", "2026-09-01", 2),
      row("c", "1.00", "2026-09-01", 3),
    ];
    expect(orderByAmount(rows, "asc").map((r) => r.entryId)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("breaks amount ties by date descending, in both directions", () => {
    const rows = [
      row("old", "5.00", "2026-09-01", 1),
      row("new", "5.00", "2026-09-09", 2),
      row("mid", "5.00", "2026-09-05", 3),
    ];
    expect(orderByAmount(rows, "desc").map((r) => r.entryId)).toEqual([
      "new",
      "mid",
      "old",
    ]);
    expect(orderByAmount(rows, "asc").map((r) => r.entryId)).toEqual([
      "new",
      "mid",
      "old",
    ]);
  });

  it("breaks same-date ties by entryNo descending", () => {
    const rows = [
      row("first", "5.00", "2026-09-01", 7),
      row("last", "5.00", "2026-09-01", 12),
      row("second", "5.00", "2026-09-01", 9),
    ];
    expect(orderByAmount(rows, "desc").map((r) => r.entryId)).toEqual([
      "last",
      "second",
      "first",
    ]);
  });

  it("does not mutate the input array", () => {
    const rows = [
      row("a", "1.00", "2026-09-01", 1),
      row("b", "2.00", "2026-09-01", 2),
    ];
    orderByAmount(rows, "desc");
    expect(rows.map((r) => r.entryId)).toEqual(["a", "b"]);
  });
});

describe("entryKindLines", () => {
  it("matches any expense line for kind=expense", () => {
    expect(entryKindLines("expense")).toEqual({
      lines: { some: { account: { type: "expense" } } },
    });
  });

  it("kind=income excludes entries that also carry an expense line", () => {
    expect(entryKindLines("income")).toEqual({
      lines: {
        some: { account: { type: "income" } },
        none: { account: { type: "expense" } },
      },
    });
  });

  it("kind=transfer requires neither an expense nor an income line", () => {
    expect(entryKindLines("transfer")).toEqual({
      lines: {
        none: { account: { type: { in: ["expense", "income"] } } },
      },
    });
  });
});

describe("dailySummaryFromLines", () => {
  function line(
    type: "expense" | "income" | "asset",
    debit: number,
    credit: number,
    date: string,
  ) {
    return {
      debit,
      credit,
      account: { type },
      entry: { date: new Date(date) },
    };
  }

  it("splits expense debit-net and income credit-net, skipping transfers", () => {
    const rows = dailySummaryFromLines(
      [
        line("expense", 35, 0, "2026-09-17T10:00:00Z"),
        line("income", 0, 50, "2026-09-17T11:00:00Z"),
        line("asset", 20, 0, "2026-09-17T12:00:00Z"),
      ],
      0,
    );
    expect(rows).toEqual([
      { day: "2026-09-17", incomeCents: 5000, expenseCents: 3500 },
    ]);
  });

  it("lets contra entries reduce their side (refunds, corrections)", () => {
    const rows = dailySummaryFromLines(
      [
        line("expense", 30, 5, "2026-09-17T10:00:00Z"),
        line("income", 5, 40, "2026-09-17T10:00:00Z"),
      ],
      0,
    );
    expect(rows).toEqual([
      { day: "2026-09-17", incomeCents: 3500, expenseCents: 2500 },
    ]);
  });

  it("buckets by the LOCAL day under a positive offset (UTC+8)", () => {
    const rows = dailySummaryFromLines(
      [line("expense", 10, 0, "2026-09-17T20:00:00Z")],
      480,
    );
    expect(rows.map((r) => r.day)).toEqual(["2026-09-18"]);
  });

  it("buckets by the LOCAL day under a negative offset (UTC-5)", () => {
    const rows = dailySummaryFromLines(
      [line("expense", 10, 0, "2026-09-17T02:00:00Z")],
      -300,
    );
    expect(rows.map((r) => r.day)).toEqual(["2026-09-16"]);
  });

  it("keys one bucket per day and orders days newest first", () => {
    const rows = dailySummaryFromLines(
      [
        line("expense", 1, 0, "2026-09-15T10:00:00Z"),
        line("expense", 2, 0, "2026-09-17T08:00:00Z"),
        line("expense", 4, 0, "2026-09-17T09:00:00Z"),
        line("expense", 8, 0, "2026-09-16T10:00:00Z"),
      ],
      0,
    );
    expect(rows).toEqual([
      { day: "2026-09-17", incomeCents: 0, expenseCents: 600 },
      { day: "2026-09-16", incomeCents: 0, expenseCents: 800 },
      { day: "2026-09-15", incomeCents: 0, expenseCents: 100 },
    ]);
  });

  it("rounds cents per line and sums integers", () => {
    const rows = dailySummaryFromLines(
      [
        line("expense", 12.5, 0, "2026-09-17T10:00:00Z"),
        line("expense", 0.05, 0, "2026-09-17T10:00:00Z"),
        line("expense", 1.2, 0, "2026-09-17T10:00:00Z"),
      ],
      0,
    );
    expect(rows[0].expenseCents).toBe(1250 + 5 + 120);
  });

  it("returns no days for an empty set", () => {
    expect(dailySummaryFromLines([], 480)).toEqual([]);
  });
});

describe("categorySummaryFromLines", () => {
  function line(
    id: string,
    type: "expense" | "income" | "asset",
    debit: number,
    credit: number,
    extra?: {
      name?: string | null;
      code?: string | null;
      icon?: string | null;
      parent?: {
        id?: string;
        name: string | null;
        code: string | null;
        icon?: string | null;
      } | null;
    },
  ) {
    return {
      debit,
      credit,
      account: {
        id,
        name: extra?.name ?? null,
        code: extra?.code ?? null,
        type,
        icon: extra?.icon ?? null,
        parent: extra?.parent
          ? {
              id: extra.parent.id ?? "acc-parent",
              icon: null,
              ...extra.parent,
            }
          : null,
      },
    };
  }

  it("splits expense debit-net and income credit-net per account, skipping transfers", () => {
    const summary = categorySummaryFromLines([
      line("acc-food", "expense", 35, 0, { code: "food", icon: "🍔" }),
      line("acc-salary", "income", 0, 50, { code: "salary", icon: "💰" }),
      line("acc-pocket", "asset", 20, 0, { code: "pocket", icon: "💳" }),
    ]);
    expect(summary.expense).toEqual([
      {
        accountId: "acc-food",
        name: null,
        code: "food",
        parentName: null,
        parentCode: null,
        parentAccountId: null,
        parentIcon: null,
        icon: "🍔",
        amountCents: 3500,
      },
    ]);
    expect(summary.income).toEqual([
      {
        accountId: "acc-salary",
        name: null,
        code: "salary",
        parentName: null,
        parentCode: null,
        parentAccountId: null,
        parentIcon: null,
        icon: "💰",
        amountCents: 5000,
      },
    ]);
  });

  it("aggregates an account's lines and carries the parent pair through", () => {
    const parent = {
      id: "acc-food-parent",
      name: null,
      code: "food",
      icon: "🍜",
    };
    const summary = categorySummaryFromLines([
      line("acc-groceries", "expense", 30, 0, {
        name: "Groceries",
        icon: "🛒",
        parent,
      }),
      line("acc-groceries", "expense", 12, 0, {
        name: "Groceries",
        icon: "🛒",
        parent,
      }),
    ]);
    expect(summary.expense).toEqual([
      {
        accountId: "acc-groceries",
        name: "Groceries",
        code: null,
        parentName: null,
        parentCode: "food",
        parentAccountId: "acc-food-parent",
        parentIcon: "🍜",
        icon: "🛒",
        amountCents: 4200,
      },
    ]);
  });

  it("lets contra entries reduce their side and keeps the row", () => {
    const summary = categorySummaryFromLines([
      line("acc-food", "expense", 30, 0, { code: "food", icon: "🍔" }),
      line("acc-food", "expense", 0, 5, { code: "food", icon: "🍔" }),
    ]);
    expect(summary.expense).toEqual([
      {
        accountId: "acc-food",
        name: null,
        code: "food",
        parentName: null,
        parentCode: null,
        parentAccountId: null,
        parentIcon: null,
        icon: "🍔",
        amountCents: 2500,
      },
    ]);
  });

  it("keeps zero-net accounts — the aggregation stays faithful, display filters", () => {
    const summary = categorySummaryFromLines([
      line("acc-food", "expense", 30, 30, { code: "food", icon: "🍔" }),
    ]);
    expect(summary.expense).toEqual([
      {
        accountId: "acc-food",
        name: null,
        code: "food",
        parentName: null,
        parentCode: null,
        parentAccountId: null,
        parentIcon: null,
        icon: "🍔",
        amountCents: 0,
      },
    ]);
  });

  it("rounds cents per line and sums integers", () => {
    const summary = categorySummaryFromLines([
      line("acc-a", "expense", 12.5, 0, { name: "A" }),
      line("acc-a", "expense", 0.05, 0, { name: "A" }),
      line("acc-a", "expense", 1.2, 0, { name: "A" }),
    ]);
    expect(summary.expense[0].amountCents).toBe(1250 + 5 + 120);
  });

  it("orders each side by amount descending with a code/name/id tiebreak", () => {
    const summary = categorySummaryFromLines([
      line("acc-small", "expense", 1, 0, { name: "Small" }),
      line("acc-big", "expense", 8, 0, { name: "Big" }),
      line("acc-tie-b", "expense", 4, 0, { code: "bbb" }),
      line("acc-tie-a", "expense", 4, 0, { code: "aaa" }),
    ]);
    expect(summary.expense.map((row) => row.accountId)).toEqual([
      "acc-big",
      "acc-tie-a",
      "acc-tie-b",
      "acc-small",
    ]);
  });

  it("returns empty arrays for an empty set", () => {
    expect(categorySummaryFromLines([])).toEqual({
      expense: [],
      income: [],
    });
  });
});

describe("sumLinesByDay", () => {
  it("applies the ledger-activity predicate for ledger-wide windows — stats never count the creator's opt-outs", async () => {
    const { tx, findMany } = capturingTx();
    await journalRepository.sumLinesByDay("led-1", {}, 480, tx);
    expect(findMany.mock.calls[0][0].where.entry).toMatchObject({
      ledgerId: "led-1",
      OR: [{ guestCreated: true }, { countsInLedger: true }],
    });
  });

  it("keeps budget-excluded entries by default — bookkeeping views count them", async () => {
    const { tx, findMany } = capturingTx();
    await journalRepository.sumLinesByDay("led-1", {}, 480, tx);
    expect(
      findMany.mock.calls[0][0].where.entry.excludedFromBudget,
    ).toBeUndefined();
  });

  it("drops the per-entry budget opt-outs only when the caller asks", async () => {
    const { tx, findMany } = capturingTx();
    await journalRepository.sumLinesByDay(
      "led-1",
      { includeBudgetExcluded: false },
      480,
      tx,
    );
    expect(findMany.mock.calls[0][0].where.entry).toMatchObject({
      ledgerId: "led-1",
      excludedFromBudget: false,
    });
  });

  it.each([
    [true, "only the entries marked 不计入预算"],
    [false, "only the entries the budget counts (日常已花)"],
  ])("scopes to excludedFromBudget=%s — the budget card's drill lists %s", async (axis) => {
    const { tx, findMany } = capturingTx();
    await journalRepository.sumLinesByDay(
      "led-1",
      { excludedFromBudget: axis },
      480,
      tx,
    );
    expect(findMany.mock.calls[0][0].where.entry.excludedFromBudget).toBe(axis);
  });

  it("includeExcluded=true widens past the activity predicate", async () => {
    const { tx, findMany } = capturingTx();
    await journalRepository.sumLinesByDay(
      "led-1",
      { includeExcluded: true },
      480,
      tx,
    );
    expect(findMany.mock.calls[0][0].where.entry.OR).toBeUndefined();
  });

  it("drops the activity predicate for project-scoped windows — a project's books count everything", async () => {
    const { tx, findMany } = capturingTx();
    await journalRepository.sumLinesByDay(
      "led-1",
      { projectId: "prj-1" },
      480,
      tx,
    );
    const where = findMany.mock.calls[0][0].where.entry;
    expect(where).toMatchObject({ ledgerId: "led-1", projectId: "prj-1" });
    expect(where.OR).toBeUndefined();
  });

  it("treats guest scope as project-scoped and clamps the project set", async () => {
    const { tx, findMany } = capturingTx();
    await journalRepository.sumLinesByDay(
      "led-1",
      { scopeProjectIds: ["prj-1", "prj-2"] },
      480,
      tx,
    );
    const where = findMany.mock.calls[0][0].where.entry;
    expect(where.OR).toBeUndefined();
    expect(where.projectId).toEqual({ in: ["prj-1", "prj-2"] });
  });

  it("threads the shared filter surface into the where", async () => {
    const { tx, findMany } = capturingTx();
    const window = {
      q: "lunch",
      participantUserId: "user-1",
      kind: "expense" as const,
      memberUserId: "user-2",
      accountId: "acc-1",
      from: new Date("2026-09-01T00:00:00Z"),
      to: new Date("2026-09-30T23:59:59Z"),
    };
    await journalRepository.sumLinesByDay("led-1", window, 480, tx);
    const where = findMany.mock.calls[0][0].where.entry;
    expect(where).toMatchObject({
      date: {
        gte: new Date("2026-09-01T00:00:00Z"),
        lte: new Date("2026-09-30T23:59:59Z"),
      },
      participants: { some: { userId: "user-1" } },
      lines: { some: { accountId: "acc-1" } },
    });
    // kind and memberUserId AND-wrap together; the kind branch is the exact
    // entryKindLines("expense") clause, the member branch is the settlement
    // OR (payer / tagged / untagged-current-member).
    const and = where.AND as Array<Record<string, unknown>>;
    expect(and).toHaveLength(2);
    expect(and).toContainEqual({
      lines: { some: { account: { type: "expense" } } },
    });
    const memberOr = and[0].OR as Array<Record<string, unknown>>;
    expect(memberOr[0]).toEqual({ paidById: "user-2" });
  });

  it("threads parentAccountId as the parent-or-children rollup clause", async () => {
    const { tx, findMany } = capturingTx();
    await journalRepository.sumLinesByDay(
      "led-1",
      { parentAccountId: "acc-parent" },
      480,
      tx,
    );
    expect(findMany.mock.calls[0][0].where.entry.lines).toEqual({
      some: {
        OR: [
          { accountId: "acc-parent" },
          { account: { parentId: "acc-parent" } },
        ],
      },
    });
  });
});

describe("listActivityEntriesWithLines", () => {
  it("applies the same filter surface as the line-mode summary — the members-mode twin never widens the set", async () => {
    const { tx, findMany } = capturingTx("journalEntry");
    await journalRepository.listActivityEntriesWithLines("led-1", {}, tx);
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      ledgerId: "led-1",
      OR: [{ guestCreated: true }, { countsInLedger: true }],
    });
    expect(findMany.mock.calls[0][0].where.excludedFromBudget).toBeUndefined();
  });

  it("includeExcluded=true lifts the activity predicate here too — the budget drill's axis", async () => {
    const { tx, findMany } = capturingTx("journalEntry");
    await journalRepository.listActivityEntriesWithLines(
      "led-1",
      { includeExcluded: true },
      tx,
    );
    const where = findMany.mock.calls[0][0].where;
    expect(where.OR).toBeUndefined();
  });
});

describe("sumLinesByCategory", () => {
  it("applies the same ledger-activity predicate as the day summary", async () => {
    const { tx, findMany } = capturingTx();
    await journalRepository.sumLinesByCategory("led-1", {}, tx);
    expect(findMany.mock.calls[0][0].where.entry).toMatchObject({
      ledgerId: "led-1",
      OR: [{ guestCreated: true }, { countsInLedger: true }],
    });
  });

  it("honors the budget flag the same way the day summary does", async () => {
    const { tx, findMany } = capturingTx();
    await journalRepository.sumLinesByCategory(
      "led-1",
      { includeBudgetExcluded: false },
      tx,
    );
    expect(findMany.mock.calls[0][0].where.entry).toMatchObject({
      ledgerId: "led-1",
      excludedFromBudget: false,
    });
  });

  it("drops the predicate for project-scoped windows and joins the parent for disambiguation", async () => {
    const { tx, findMany } = capturingTx();
    await journalRepository.sumLinesByCategory(
      "led-1",
      { projectId: "prj-1" },
      tx,
    );
    const call = findMany.mock.calls[0][0];
    const where = call.where.entry;
    expect(where).toMatchObject({ ledgerId: "led-1", projectId: "prj-1" });
    expect(where.OR).toBeUndefined();
    expect(call.select.account.select).toMatchObject({
      id: true,
      name: true,
      code: true,
      type: true,
      parent: { select: { id: true, name: true, code: true } },
    });
  });

  it("translates a parentAccountId window into the rollup line filter — the parent itself plus its children", async () => {
    const { tx, findMany } = capturingTx();
    await journalRepository.sumLinesByCategory(
      "led-1",
      { parentAccountId: "acc-food" },
      tx,
    );
    expect(findMany.mock.calls[0][0].where.entry.lines).toMatchObject({
      some: {
        OR: [{ accountId: "acc-food" }, { account: { parentId: "acc-food" } }],
      },
    });
  });
});

describe("entryFilterWhere", () => {
  it("scopes to the countsInLedger=false side when the axis is set", () => {
    const where = JSON.stringify(
      entryFilterWhere("l1", { countsInLedger: false }),
    );
    expect(where).toContain('"countsInLedger":false');
  });

  it("lifts the ledger-activity predicate on the axis alone", () => {
    // countsInLedger:false without any includeExcluded ride-along: the
    // predicate's OR would zero the narrowed set, so the where-builder
    // lifts it itself — a caller that forgets the pairing stays correct.
    const where = JSON.stringify(
      entryFilterWhere("l1", { countsInLedger: false }),
    );
    expect(where).toContain('"countsInLedger":false');
    expect(where).not.toContain("guestCreated");
  });

  it("keeps every entry when the axis is absent", () => {
    // Top-level only: the ledger-activity predicate's own OR branch
    // legitimately mentions countsInLedger(true) — that's the caliber,
    // not the axis.
    const where = entryFilterWhere("l1", {});
    expect(where).not.toHaveProperty("countsInLedger");
  });

  it("lets the not-counted isolation coexist with the includeExcluded escape hatch", () => {
    // The funnel's 不计收支 toggle sends both: without includeExcluded the
    // ledger-activity predicate would drop exactly the set being isolated
    // (its OR requires countsInLedger true or a guest post), zeroing the
    // narrowed window.
    const where = JSON.stringify(
      entryFilterWhere("l1", { countsInLedger: false, includeExcluded: true }),
    );
    expect(where).toContain('"countsInLedger":false');
    expect(where).not.toContain("guestCreated");
  });

  it("keeps the ledger-activity predicate while the escape hatch is closed", () => {
    const where = JSON.stringify(
      entryFilterWhere("l1", { includeExcluded: false }),
    );
    expect(where).toContain("guestCreated");
  });
});
