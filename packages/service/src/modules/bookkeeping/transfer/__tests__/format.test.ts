import { describe, expect, it } from "vitest";
import {
  centsToYuan,
  dayKeyToInstant,
  EXPORT_SHEETS,
  headerToField,
  instantToDayKey,
  joinList,
  parseBool,
  parseDayKey,
  parseInteger,
  parseYuanToCents,
  photoFileName,
  SHEET_COLUMNS,
  SHEET_ORDER,
  splitList,
} from "../format";

describe("sheet column contract", () => {
  it("gives every sheet a unique header and field per column", () => {
    for (const sheet of SHEET_ORDER) {
      const columns = SHEET_COLUMNS[sheet];
      const headers = columns.map((column) => column.header);
      const fields = columns.map((column) => column.field);
      expect(new Set(headers).size, `${sheet} 表头重复`).toBe(headers.length);
      expect(new Set(fields).size, `${sheet} 字段重复`).toBe(fields.length);
    }
  });

  it("maps every header back to its field", () => {
    for (const sheet of SHEET_ORDER) {
      const map = headerToField(sheet);
      for (const column of SHEET_COLUMNS[sheet]) {
        expect(map.get(column.header)).toBe(column.field);
      }
    }
  });

  it("names every sheet after the export table", () => {
    expect(SHEET_ORDER).toEqual(Object.keys(EXPORT_SHEETS));
    for (const name of Object.values(EXPORT_SHEETS)) {
      expect(name.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("money cells", () => {
  it("round-trips cents through a yuan cell", () => {
    expect(centsToYuan(1234)).toBe(12.34);
    expect(parseYuanToCents(12.34)).toBe(1234);
    expect(parseYuanToCents(centsToYuan(999_999))).toBe(999_999);
  });

  it("reads what a spreadsheet hands back", () => {
    expect(parseYuanToCents("50")).toBe(5000);
    expect(parseYuanToCents("¥1,234.50")).toBe(123450);
    expect(parseYuanToCents("￥12.00")).toBe(1200);
    expect(parseYuanToCents("")).toBeNull();
    expect(parseYuanToCents("abc")).toBeNull();
    expect(parseYuanToCents(null)).toBeNull();
  });
});

describe("list cells", () => {
  it("splits what joinList wrote", () => {
    expect(splitList(joinList(["Alice", "Bob"]))).toEqual(["Alice", "Bob"]);
    expect(splitList("；Alice； Bob ；")).toEqual(["Alice", "Bob"]);
    expect(splitList("")).toEqual([]);
  });
});

describe("booleans and integers", () => {
  it("accepts the shapes a spreadsheet stores", () => {
    expect(parseBool(true)).toBe(true);
    expect(parseBool("TRUE")).toBe(true);
    expect(parseBool("是")).toBe(true);
    expect(parseBool(1)).toBe(true);
    expect(parseBool("否")).toBe(false);
    expect(parseBool("")).toBe(false);
    expect(parseBool("maybe")).toBeNull();
  });

  it("rejects a non-integer where an integer is declared", () => {
    expect(parseInteger(12)).toBe(12);
    expect(parseInteger("12")).toBe(12);
    expect(parseInteger("12.5")).toBeNull();
    expect(parseInteger("abc")).toBeNull();
  });
});

describe("day cells", () => {
  it("keeps the DAY stable across an offset round trip", () => {
    // The day column is lossy by construction — it carries no time of day —
    // which is exactly why data.json keeps the instant and the workbook
    // doesn't. What has to hold is that a day read back at the offset it
    // was written at is the same day, not a neighbour's.
    const instant = new Date("2026-08-22T00:00:00.000Z");
    for (const offset of [0, 480, -300]) {
      const day = instantToDayKey(instant, offset);
      expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const back = parseDayKey(day, offset);
      expect(back).not.toBeNull();
      expect(instantToDayKey(back as Date, offset)).toBe(day);
    }
  });

  it("shifts the day east of UTC, which is the point of the column", () => {
    // 2026-08-21T16:00Z is already the 22nd in UTC+8.
    const instant = new Date("2026-08-21T16:00:00.000Z");
    expect(instantToDayKey(instant, 0)).toBe("2026-08-21");
    expect(instantToDayKey(instant, 480)).toBe("2026-08-22");
    expect(dayKeyToInstant("2026-08-22", 480)).toEqual(instant);
  });

  it("reads a date cell Excel re-typed as a date", () => {
    const asDate = new Date("2026-08-22T00:00:00.000Z");
    expect(parseDayKey(asDate, 0)).toEqual(asDate);
    // Excel's day 1 is 1899-12-30; serial 46256 is 2026-08-22.
    expect(parseDayKey(46256, 0)?.toISOString().slice(0, 10)).toBe(
      "2026-08-22",
    );
  });

  it("passes a full instant through untouched", () => {
    const iso = "2026-08-22T10:30:00.000Z";
    expect(parseDayKey(iso, 480)?.toISOString()).toBe(iso);
  });
});

describe("photo file names", () => {
  it("pads the entry number so files sort with the entries", () => {
    expect(photoFileName(7, 1, "jpg")).toBe("E000007-1.jpg");
    expect(photoFileName(123456, 12, "png")).toBe("E123456-12.png");
  });
});
