import { describe, expect, it } from "vitest";
import {
  EXPORT_SHEETS,
  instantToDayKey,
  SHEET_COLUMNS,
  SHEET_ORDER,
} from "../format";
import { buildWorkbook, readWorkbook, type WorkbookRows } from "../xlsx";

/**
 * The workbook is written and read through the same `SHEET_COLUMNS`
 * contract, so a round trip that returns the rows it was handed is the
 * proof that contract still describes itself. A renamed header, a dropped
 * `kind`, or a column added to one side only all fail here rather than in
 * an import three weeks later.
 */
const sample: WorkbookRows = {
  ledger: [
    {
      key: "led_1",
      name: "家庭账本",
      description: "和 Alice 一起",
      currency: "CNY",
      status: "active",
      isDefault: true,
      timezoneOffsetMinutes: 480,
      budgetExcludedAccountKeys: ["acc_insurance"],
      exportedAt: "2026-08-22T10:00:00.000Z",
      entryCount: 2,
      photoCount: 1,
    },
  ],
  accounts: [
    {
      key: "acc_food",
      name: null,
      code: "food",
      type: "expense",
      parentKey: null,
      sortOrder: 200,
      icon: "🍜",
      status: "active",
      realAccountKey: null,
      flags: ["builtin"],
      meta: { note: "餐费" },
    },
    {
      key: "acc_meals",
      name: "午饭",
      code: "meals",
      type: "expense",
      parentKey: "acc_food",
      sortOrder: 201,
      icon: "🍚",
      status: "active",
      realAccountKey: null,
      flags: [],
      meta: null,
    },
  ],
  entries: [
    {
      key: "ent_1",
      entryNo: 7,
      day: "2026-08-22",
      kind: "expense",
      amountCents: 3550,
      memo: "午饭",
      merchant: "星巴克",
      projectKey: null,
      paidBy: "我",
      participants: ["Alice", "Bob<bob@example.com>"],
      address: "朝阳区",
      addressName: "三里屯",
      latitude: 39.983425,
      longitude: 116.322083,
      countsInLedger: true,
      excludedFromBudget: false,
      guestCreated: false,
      status: "posted",
      createdBy: "我",
      createdAt: "2026-08-22T10:00:00.000Z",
      attachmentCount: 1,
      attachmentFiles: ["E000007-1.jpg"],
    },
  ],
  entryLines: [
    {
      entryKey: "ent_1",
      lineNo: 1,
      accountKey: "acc_meals",
      debitCents: 3550,
      creditCents: 0,
      memo: null,
    },
    {
      entryKey: "ent_1",
      lineNo: 2,
      accountKey: "acc_default",
      debitCents: 0,
      creditCents: 3550,
      memo: "结余",
    },
  ],
  projects: [
    {
      key: "prj_1",
      name: "京都之行",
      description: null,
      status: "active",
      startDate: "2026-09-01",
      endDate: "2026-09-10",
      members: ["我", "Alice"],
    },
  ],
  members: [
    {
      key: "usr_me",
      name: "我",
      email: null,
      role: "owner",
      isVirtual: false,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  budgets: [
    { kind: "year", year: 2026, month: null, accountKey: null, cents: 300000 },
    { kind: "month", year: 2026, month: 12, accountKey: null, cents: 500000 },
    {
      kind: "category",
      year: 2026,
      month: null,
      accountKey: "acc_food",
      cents: 120000,
    },
  ],
  realAccounts: [
    {
      key: "real_1",
      name: "招行卡",
      type: "asset",
      status: "active",
      icon: "💳",
      meta: { number: "6222" },
    },
  ],
  preferences: [
    {
      scope: "ledger",
      scopeKey: "led_1",
      key: "quickEntry",
      value: { chipFields: ["account", "memo"] },
    },
  ],
};

describe("workbook round trip", () => {
  it("returns the rows it was handed", async () => {
    const workbook = await buildWorkbook(sample);
    const parsed = await readWorkbook(workbook);

    expect(parsed.issues).toEqual([]);
    expect(parsed.timezoneOffsetMinutes).toBe(480);

    for (const sheet of SHEET_ORDER) {
      // Every column comes back as it went in, except a 日期 column: a day
      // has no time of day, so the reader hands back the instant of that
      // local midnight — which is exactly what an import needs and exactly
      // what would drift if the offset were ignored.
      const dayFields = new Set(
        SHEET_COLUMNS[sheet]
          .filter((column) => column.kind === "day")
          .map((column) => column.field),
      );
      expect(parsed.rows[sheet], sheet).toHaveLength(sample[sheet].length);
      parsed.rows[sheet].forEach((row, index) => {
        for (const [field, value] of Object.entries(sample[sheet][index])) {
          if (dayFields.has(field)) {
            expect(value, `${sheet}.${field}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(
              instantToDayKey(row[field] as Date, 480),
              `${sheet}.${field}`,
            ).toBe(value);
            continue;
          }
          expect(row[field], `${sheet}.${field}`).toEqual(value);
        }
      });
    }
  });

  it("keeps money in yuan on the sheet and cents in the row", async () => {
    const parsed = await readWorkbook(await buildWorkbook(sample));
    // 3550 cents is written as 35.50 and read back as 3550 — the rounding
    // is what keeps a float-typed 12.34 from importing as 1233 cents.
    expect(parsed.rows.entries[0].amountCents).toBe(3550);
    expect(parsed.rows.entryLines[0].debitCents).toBe(3550);
    expect(parsed.rows.budgets[0].cents).toBe(300000);
  });

  it("names every sheet the export format declares", async () => {
    const parsed = await readWorkbook(await buildWorkbook(sample));
    for (const sheet of SHEET_ORDER) {
      // A row coming back proves the sheet was found by name, not index.
      expect(parsed.rows[sheet].length).toBe(sample[sheet].length);
    }
    expect(Object.values(EXPORT_SHEETS)).toHaveLength(SHEET_ORDER.length);
  });
});

describe("workbook reading of a hand-edited file", () => {
  const edited = {
    ...sample,
    entries: [
      {
        ...sample.entries[0],
        // What a user's Excel leaves behind: text amounts with a currency
        // mark, "是" for a checkbox, and a day typed by hand.
        memo: "  午饭（改）  ",
        countsInLedger: "是",
        day: "2026-08-20",
      },
    ],
  };

  it("coerces the shapes a spreadsheet produces", async () => {
    const parsed = await readWorkbook(await buildWorkbook(edited));
    // "是" instead of a checkbox, a hand-typed day, and stray whitespace in
    // a memo — all of which arrive as cells rather than typed values.
    expect(parsed.rows.entries[0].countsInLedger).toBe(true);
    expect(parsed.rows.entries[0].memo).toBe("午饭（改）");
    expect(parsed.rows.entries[0].day).toBeInstanceOf(Date);
    expect(instantToDayKey(parsed.rows.entries[0].day as Date, 480)).toBe(
      "2026-08-20",
    );
  });

  it("reports an unreadable cell with its row instead of dropping it", async () => {
    const workbook = await buildWorkbook({
      ...sample,
      entries: [
        { ...sample.entries[0], amountCents: "不是数字" as unknown as number },
      ],
    });
    const parsed = await readWorkbook(workbook);
    const issue = parsed.issues.find((i) => i.field === "amountCents");
    expect(issue).toBeDefined();
    expect(issue?.row).toBe(2);
    expect(issue?.sheet).toBe("entries");
    // The row itself survives so the import can report and skip it.
    expect(parsed.rows.entries).toHaveLength(1);
  });
});
