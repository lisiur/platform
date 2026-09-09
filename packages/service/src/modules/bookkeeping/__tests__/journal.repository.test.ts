import { describe, expect, it, vi } from "vitest";
import { Prisma } from "#generated/prisma/client";

vi.mock("#lib/db", () => ({
  prisma: {},
}));

import { orderByAmount } from "../journal.repository";

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
