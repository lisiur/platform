import { z } from "@hono/zod-openapi";

/**
 * The ledger transfer format: the portable document a user can carry
 * between devices and accounts, and the human-facing workbook that shows
 * it to them.
 *
 * One file, three views of the same data:
 *
 * - `data.json` — the lossless source of truth. Exact ids, ISO instants,
 *   integer cents. This is what a restore reads.
 * - `账本.xlsx` — the same rows as nine sheets, amounts in yuan, dates in
 *   the exporting client's local day. This is what a human reads and, on
 *   its own, edits and re-imports.
 * - `photos/` — the receipts, original bytes.
 *
 * A `.zip` (all three) or a bare `.json` restores; a bare `.xlsx` imports
 * from the spreadsheet. The zip NEVER merges xlsx edits back in: one
 * source of truth per mode beats guessing whether a cell was touched.
 *
 * Header text lives here once, in `SHEET_COLUMNS`, and both the writer and
 * the reader index through it — a header can never drift from the field it
 * names. An English header set would be a second `Record<Sheet, columns>`
 * plus an alias map in `headerToField`; the canonical (zh) set is what
 * ships, matching the product's primary locale.
 */

/** Bumped when `data.json`'s shape changes incompatibly. A reader that
 *  finds a HIGHER version refuses the file (400) rather than importing a
 *  partial shape; a LOWER one is read field-by-field, ignoring what it
 *  doesn't know. */
export const LEDGER_EXPORT_FORMAT_VERSION = 1;

export const EXPORT_SHEETS = {
  ledger: "账本",
  accounts: "账户",
  entries: "流水",
  entryLines: "流水明细",
  projects: "项目",
  members: "成员",
  budgets: "预算",
  realAccounts: "真实账户",
  preferences: "偏好",
} as const;

export type SheetName = keyof typeof EXPORT_SHEETS;

/** Sheet order in the workbook and the order the reader expects them in. */
export const SHEET_ORDER = Object.keys(EXPORT_SHEETS) as SheetName[];

/**
 * How a column's value is encoded on the way out and decoded on the way
 * back. Declaring it per column (rather than converting at each call site)
 * is what keeps the workbook's money columns in yuan and the document's in
 * cents without either side having to remember.
 */
export type SheetColumnKind =
  | "text"
  | "int"
  | "number"
  | "money"
  | "bool"
  | "list"
  | "json"
  | "day";

export type SheetColumn = {
  /** Row-object field this column carries. The single mapping the writer
   *  and reader both go through. */
  field: string;
  header: string;
  kind?: SheetColumnKind;
  width?: number;
};

/**
 * The workbook's column contract. `键` (key) columns carry the source row's
 * original id: unique within the file and stable across sheets, which is
 * what lets 流水明细 reference 流水 and 项目 reference 成员 without ids
 * leaking into the import. A blank key means "new row" on import.
 */
export const SHEET_COLUMNS: Record<SheetName, readonly SheetColumn[]> = {
  ledger: [
    { field: "key", header: "键", width: 26 },
    { field: "name", header: "名称", width: 20 },
    { field: "description", header: "描述", width: 28 },
    { field: "currency", header: "币种", width: 8 },
    { field: "status", header: "状态", width: 10 },
    { field: "isDefault", header: "默认账本", kind: "bool" },
    { field: "timezoneOffsetMinutes", header: "时区偏移", kind: "int" },
    {
      field: "budgetExcludedAccountKeys",
      header: "预算排除账户键",
      kind: "list",
      width: 24,
    },
    { field: "exportedAt", header: "导出时间", width: 24 },
    { field: "entryCount", header: "流水条数", kind: "int" },
    { field: "photoCount", header: "照片数", kind: "int" },
  ],
  accounts: [
    { field: "key", header: "键", width: 26 },
    { field: "name", header: "名称", width: 18 },
    { field: "code", header: "内置编码", width: 18 },
    { field: "type", header: "类型", width: 10 },
    { field: "parentKey", header: "上级键", width: 26 },
    { field: "sortOrder", header: "排序", kind: "int" },
    { field: "icon", header: "图标", width: 8 },
    { field: "status", header: "状态", width: 10 },
    { field: "realAccountKey", header: "关联真实账户键", width: 20 },
    { field: "flags", header: "行为标记", kind: "list", width: 30 },
    { field: "meta", header: "元数据", kind: "json", width: 24 },
  ],
  entries: [
    { field: "key", header: "键", width: 26 },
    { field: "entryNo", header: "序号", kind: "int", width: 8 },
    { field: "day", header: "日期", kind: "day", width: 12 },
    { field: "kind", header: "类型", width: 10 },
    { field: "amountCents", header: "金额", kind: "money", width: 12 },
    { field: "memo", header: "备注", width: 28 },
    { field: "merchant", header: "商家", width: 16 },
    { field: "projectKey", header: "项目键", width: 26 },
    { field: "paidBy", header: "付款人", width: 16 },
    { field: "participants", header: "参与人", kind: "list", width: 24 },
    { field: "address", header: "地点", width: 24 },
    { field: "addressName", header: "地点名称", width: 16 },
    { field: "latitude", header: "纬度", kind: "number", width: 12 },
    { field: "longitude", header: "经度", kind: "number", width: 12 },
    { field: "countsInLedger", header: "计入账本", kind: "bool", width: 10 },
    {
      field: "excludedFromBudget",
      header: "不计入预算",
      kind: "bool",
      width: 12,
    },
    { field: "guestCreated", header: "访客创建", kind: "bool", width: 10 },
    { field: "status", header: "状态", width: 10 },
    { field: "createdBy", header: "创建人", width: 16 },
    { field: "createdAt", header: "创建时间", width: 24 },
    { field: "attachmentCount", header: "附件数", kind: "int", width: 8 },
    { field: "attachmentFiles", header: "附件文件", kind: "list", width: 32 },
  ],
  entryLines: [
    { field: "entryKey", header: "流水键", width: 26 },
    { field: "lineNo", header: "行号", kind: "int", width: 8 },
    { field: "accountKey", header: "账户键", width: 26 },
    { field: "debitCents", header: "借方", kind: "money", width: 12 },
    { field: "creditCents", header: "贷方", kind: "money", width: 12 },
    { field: "memo", header: "备注", width: 24 },
  ],
  projects: [
    { field: "key", header: "键", width: 26 },
    { field: "name", header: "名称", width: 20 },
    { field: "description", header: "描述", width: 28 },
    { field: "status", header: "状态", width: 10 },
    { field: "startDate", header: "开始日期", kind: "day", width: 14 },
    { field: "endDate", header: "结束日期", kind: "day", width: 14 },
    { field: "members", header: "成员", kind: "list", width: 24 },
  ],
  members: [
    { field: "key", header: "键", width: 26 },
    { field: "name", header: "姓名", width: 16 },
    { field: "email", header: "邮箱", width: 24 },
    { field: "role", header: "角色", width: 10 },
    { field: "isVirtual", header: "虚拟成员", kind: "bool", width: 10 },
    { field: "createdAt", header: "加入时间", width: 24 },
  ],
  budgets: [
    { field: "kind", header: "类型", width: 12 },
    { field: "year", header: "年份", kind: "int" },
    { field: "month", header: "月份", kind: "int", width: 8 },
    { field: "accountKey", header: "账户键", width: 26 },
    { field: "cents", header: "金额", kind: "money", width: 12 },
  ],
  realAccounts: [
    { field: "key", header: "键", width: 26 },
    { field: "name", header: "名称", width: 20 },
    { field: "type", header: "类型", width: 10 },
    { field: "status", header: "状态", width: 10 },
    { field: "icon", header: "图标", width: 8 },
    { field: "meta", header: "元数据", kind: "json", width: 24 },
  ],
  preferences: [
    { field: "scope", header: "作用域", width: 12 },
    { field: "scopeKey", header: "作用域键", width: 26 },
    { field: "key", header: "键", width: 16 },
    { field: "value", header: "值", kind: "json", width: 40 },
  ],
};

/** Excel's day 1 is 1899-12-30 (the Lotus 1-2-3 offset every spreadsheet
 *  inherited). A 日期 column the user's Excel re-typed as a date comes back
 *  as a Date — or, when it kept the raw cell, as this serial number. */
const EXCEL_EPOCH_OFFSET_DAYS = 25_569;

export function excelSerialToDate(serial: number): Date {
  return new Date(Math.round((serial - EXCEL_EPOCH_OFFSET_DAYS) * 86_400_000));
}

/** Header text → row field, per sheet. The reader's only way to find a
 *  column, so a reordered or renamed header keeps working. */
export function headerToField(sheet: SheetName): Map<string, string> {
  return new Map(SHEET_COLUMNS[sheet].map((c) => [c.header, c.field]));
}

// ---------------------------------------------------------------------------
// data.json
// ---------------------------------------------------------------------------

const nullableString = z.string().nullable();
const instant = z.string();

export const ledgerExportDocumentSchema = z.object({
  formatVersion: z.number().int(),
  exportedAt: instant,
  /** Minutes east of UTC the workbook's 日期 column was rendered in. The
   *  instants below are authoritative; this only tells a spreadsheet-only
   *  import which day a value fell on. */
  timezoneOffsetMinutes: z.number().int(),
  ledger: z.object({
    key: z.string(),
    name: z.string(),
    description: nullableString,
    currency: z.string(),
    status: z.string(),
    isDefault: z.boolean(),
    createdAt: instant,
  }),
  /** Categories quick entry defaults to "exclude from budget". Lives at
   *  the top level because the sheet that shows it is the ledger row, while
   *  the storage is the ledger's own column. */
  budgetExcludedAccountKeys: z.array(z.string()),
  accounts: z.array(
    z.object({
      key: z.string(),
      name: nullableString,
      /** Seeded account's stable i18n key (`code`) — the match key an
       *  import resolves against the target ledger's accounts. */
      code: nullableString,
      type: z.string(),
      parentKey: nullableString,
      sortOrder: z.number().int(),
      icon: nullableString,
      status: z.string(),
      flags: z.array(z.string()),
      meta: z.unknown().nullable(),
      realAccountKey: nullableString,
    }),
  ),
  entries: z.array(
    z.object({
      key: z.string(),
      entryNo: z.number().int(),
      /** Exact posting instant. Never a local day — see the format note. */
      date: instant,
      memo: nullableString,
      merchant: nullableString,
      status: z.string(),
      countsInLedger: z.boolean(),
      excludedFromBudget: z.boolean(),
      guestCreated: z.boolean(),
      projectKey: nullableString,
      /** Member key (userId) of who fronted the money, if not the creator. */
      paidByKey: nullableString,
      createdByKey: nullableString,
      createdAt: instant,
      location: z
        .object({
          address: nullableString,
          addressName: nullableString,
          latitude: z.number().nullable(),
          longitude: z.number().nullable(),
        })
        .nullable(),
      participants: z.array(
        z.object({
          key: z.string(),
          name: z.string(),
          email: nullableString,
        }),
      ),
      lines: z.array(
        z.object({
          accountKey: z.string(),
          debitCents: z.number().int(),
          creditCents: z.number().int(),
          memo: nullableString,
        }),
      ),
      attachments: z.array(
        z.object({
          /** Path inside the archive's `photos/` folder. */
          file: z.string(),
          mimeType: z.string(),
          size: z.number().int(),
          /** sha256 of the bytes — the import's dedupe + integrity check. */
          hash: z.string(),
        }),
      ),
    }),
  ),
  projects: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      description: nullableString,
      status: z.string(),
      startDate: nullableString,
      endDate: nullableString,
      memberKeys: z.array(z.string()),
    }),
  ),
  members: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      /** Present only in an owner export (the same redaction the roster
       *  applies); editors get names alone. */
      email: nullableString,
      role: z.string(),
      isVirtual: z.boolean(),
      createdAt: instant,
    }),
  ),
  budgets: z.array(
    z.object({
      kind: z.enum(["year", "month", "category"]),
      year: z.number().int(),
      /** `month` rows only. */
      month: z.number().int().nullable(),
      /** `category` rows only. */
      accountKey: z.string().nullable(),
      cents: z.number().int(),
    }),
  ),
  realAccounts: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      type: z.string(),
      status: z.string(),
      icon: nullableString,
      meta: z.unknown().nullable(),
    }),
  ),
  preferences: z.array(
    z.object({
      scope: z.string(),
      scopeKey: z.string(),
      key: z.string(),
      value: z.unknown(),
    }),
  ),
});

export type LedgerExportDocument = z.infer<typeof ledgerExportDocumentSchema>;
export type LedgerExportAccount = LedgerExportDocument["accounts"][number];
export type LedgerExportEntry = LedgerExportDocument["entries"][number];
export type LedgerExportProject = LedgerExportDocument["projects"][number];
export type LedgerExportMember = LedgerExportDocument["members"][number];
export type LedgerExportBudget = LedgerExportDocument["budgets"][number];

export const BUDGET_KIND_LABELS: Record<LedgerExportBudget["kind"], string> = {
  year: "年度",
  month: "月度覆盖",
  category: "分类",
};

/** Ledger-scoped preferences are the portable ones; the app-level tab
 *  layout is device setup, not ledger data. */
export const IMPORTABLE_PREFERENCE_SCOPE = "ledger";

/** The archive's photo file name for one receipt. `entryNo` is unique per
 *  ledger, so this is unique within an export; the writer (zip entry) and
 *  the document (bare name) both go through here, which is what keeps the
 *  two halves of a `photos/` reference agreeing. */
export function photoFileName(
  entryNo: number,
  index: number,
  extension: string,
): string {
  return `E${String(entryNo).padStart(6, "0")}-${index}.${extension}`;
}

/** An importer creating people who'll never register gets the same cap the
 *  share surface enforces (MAX_VIRTUAL_MEMBERS_PER_LEDGER); beyond it the
 *  import falls back to the importer and reports the difference. */
export const MAX_IMPORT_VIRTUAL_MEMBERS = 50;

// ---------------------------------------------------------------------------
// Cell coercion
// ---------------------------------------------------------------------------

/** Multi-value separator in every list column, chosen because no ledger
 *  name or memo is likely to contain it and Excel treats it as plain text. */
export const LIST_SEPARATOR = "；";

export function joinList(values: readonly string[]): string {
  return values.join(LIST_SEPARATOR);
}

export function splitList(value: string): string[] {
  return value
    .split(LIST_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Cents → yuan for a spreadsheet cell. Two decimals by construction
 *  (amounts are stored as DECIMAL(12,2)); the import rounds back. */
export function centsToYuan(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * Yuan cell → cents. Tolerates what a spreadsheet hands back: a number, a
 * numeric string, a currency-marked string ("¥50.00"), thousands
 * separators, and blank-as-absent. Rounding kills the float dust a
 * `12.34 * 100` leaves behind.
 */
export function parseYuanToCents(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value * 100) : null;
  }
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[¥￥,，\s]/g, "");
  if (cleaned.length === 0) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

/** Spreadsheet booleans are typed ("TRUE"), localized ("是"), or numeric. */
export function parseBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (["true", "是", "1", "y", "yes"].includes(normalized)) return true;
  if (["false", "否", "0", "n", "no", ""].includes(normalized)) return false;
  return null;
}

export function parseText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

export function parseInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

/** `YYYY-MM-DD` in `offsetMinutes` east of UTC → the UTC instant of that
 *  local midnight. The inverse of the repository's `localDayKey`, and the
 *  only place a spreadsheet's 日期 column becomes an instant again. */
export function dayKeyToInstant(day: string, offsetMinutes: number): Date {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) - offsetMinutes * 60_000);
}

/** The instant → `YYYY-MM-DD` direction, for the writer. Mirrors
 *  `localDayKey` in the journal repository, kept here so the sheet layer
 *  stays importable without pulling the database client in. */
export function instantToDayKey(date: Date, offsetMinutes: number): string {
  return new Date(date.getTime() + offsetMinutes * 60_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * A day cell → an instant. Accepts what a spreadsheet hands back: the
 * `YYYY-MM-DD` string we wrote, a real Date (the user's Excel re-typed the
 * column as a date), an Excel serial number, or a full ISO instant (so a
 * file exported with data.json and hand-edited in a date-aware Excel still
 * round-trips).
 */
export function parseDayKey(
  value: unknown,
  offsetMinutes: number,
): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? excelSerialToDate(value) : null;
  }
  const text = parseText(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return dayKeyToInstant(text, offsetMinutes);
  }
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}
