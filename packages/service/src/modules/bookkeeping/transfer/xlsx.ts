import ExcelJS from "exceljs";
import {
  centsToYuan,
  EXPORT_SHEETS,
  headerToField,
  joinList,
  parseBool,
  parseDayKey,
  parseInteger,
  parseText,
  parseYuanToCents,
  SHEET_COLUMNS,
  SHEET_ORDER,
  type SheetColumn,
  type SheetName,
  splitList,
} from "./format";

/**
 * The workbook layer: rows keyed by the field names `SHEET_COLUMNS`
 * declares, in and out. Nothing here knows what a journal entry is — the
 * writer hands over rows shaped like the export document, the reader hands
 * back the same shape, and `import.service` is the only place that knows
 * the difference matters.
 *
 * One asymmetry the reader has to absorb: it's reading a file a human has
 * had open in Excel. Cells come back as strings, dates, or numbers nobody
 * intended (a 日期 column Excel re-typed as a date, an amount typed with a
 * ¥ on it), and a half-filled row is normal. So decoding is total — it
 * never throws — and every cell it couldn't make sense of becomes an
 * issue carrying its row number, which the import report surfaces.
 */

/** A row keyed by `SHEET_COLUMNS[sheet][].field`. */
export type SheetRow = Record<string, unknown>;

export type WorkbookRows = Record<SheetName, SheetRow[]>;

/** A cell (or a missing column) the reader couldn't turn back into the
 *  document's shape. `row` is the spreadsheet row, 1-based including the
 *  header, so a user can find it. */
export type SheetIssue = {
  sheet: SheetName;
  row: number;
  field: string;
  header: string;
  message: string;
};

export type ParsedWorkbook = {
  rows: WorkbookRows;
  issues: SheetIssue[];
  /** The 日期 columns' offset, from the 账本 sheet. Absent sheet = UTC. */
  timezoneOffsetMinutes: number;
};

/** Columns an import can't proceed without. Everything else is optional:
 *  a user who deletes a read-only column (导出时间, 照片数) shouldn't fail
 *  the whole file. */
const REQUIRED_HEADERS: Partial<Record<SheetName, readonly string[]>> = {
  accounts: ["类型"],
  entries: ["日期"],
  entryLines: ["账户键", "借方", "贷方"],
};

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

const MONEY_FORMAT = "#,##0.00";

export async function buildWorkbook(rows: WorkbookRows): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "潜望 Qianlai";
  workbook.created = new Date();

  for (const sheet of SHEET_ORDER) {
    const worksheet = workbook.addWorksheet(EXPORT_SHEETS[sheet]);
    const columns = SHEET_COLUMNS[sheet];

    worksheet.columns = columns.map((column) => ({
      header: column.header,
      key: column.field,
      width: column.width ?? 16,
      ...(column.kind === "money" ? { style: { numFmt: MONEY_FORMAT } } : {}),
    }));
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    worksheet.getRow(1).font = { bold: true };

    for (const row of rows[sheet]) {
      worksheet.addRow(
        columns.map((column) => encodeCell(column, row[column.field])),
      );
    }
  }

  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function encodeCell(
  column: SheetColumn,
  value: unknown,
): string | number | boolean | null {
  switch (column.kind) {
    case "money":
      return value === null || value === undefined || value === ""
        ? null
        : centsToYuan(Number(value));
    case "int":
    case "number":
      return value === null || value === undefined || value === ""
        ? null
        : Number(value);
    case "bool":
      return parseBool(value);
    case "list":
      if (Array.isArray(value)) {
        return joinList(value.map((item) => String(item)));
      }
      return typeof value === "string" && value.length > 0 ? value : null;
    case "json":
      if (value === null || value === undefined) return null;
      return typeof value === "string" ? value : JSON.stringify(value);
    case "day":
      if (value instanceof Date) return value.toISOString();
      return typeof value === "string" && value.length > 0 ? value : null;
    default:
      if (value === null || value === undefined || value === "") return null;
      if (typeof value === "string") return value;
      if (typeof value === "number" || typeof value === "boolean") return value;
      return JSON.stringify(value);
  }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function readWorkbook(
  buffer: Uint8Array,
): Promise<ParsedWorkbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(toArrayBuffer(buffer));

  const issues: SheetIssue[] = [];
  const rows = {} as WorkbookRows;
  for (const sheet of SHEET_ORDER) rows[sheet] = [];

  // The 账本 sheet first: its 时区偏移 decides how every 日期 cell in the
  // rest of the workbook resolves back to an instant.
  const ledgerWorksheet = workbook.getWorksheet(EXPORT_SHEETS.ledger);
  if (ledgerWorksheet) {
    rows.ledger = readSheet("ledger", ledgerWorksheet, issues, 0);
  }
  const timezoneOffsetMinutes = readTimezoneOffset(rows.ledger, issues);

  for (const sheet of SHEET_ORDER) {
    if (sheet === "ledger") continue;
    const worksheet = workbook.getWorksheet(EXPORT_SHEETS[sheet]);
    if (!worksheet) continue; // A sheet the user deleted imports as empty.
    rows[sheet] = readSheet(sheet, worksheet, issues, timezoneOffsetMinutes);
  }

  return { rows, issues, timezoneOffsetMinutes };
}

function readTimezoneOffset(rows: SheetRow[], issues: SheetIssue[]): number {
  const raw = rows[0]?.timezoneOffsetMinutes;
  if (raw === null || raw === undefined) return 0;
  const parsed = parseInteger(raw);
  if (parsed === null || Math.abs(parsed) > 840) {
    issues.push({
      sheet: "ledger",
      row: 2,
      field: "timezoneOffsetMinutes",
      header: "时区偏移",
      message: "时区偏移不是 -840..840 之间的整数，日期按 UTC 00:00 处理",
    });
    return 0;
  }
  return parsed;
}

/** The sheet KEY, not its workbook name: `SHEET_COLUMNS` is keyed by
 *  the English key while the name on the tab is the Chinese label, and the
 *  two are deliberately separate (an English header set would rename the
 *  tabs without touching the keys). */
function readSheet(
  sheet: SheetName,
  worksheet: ExcelJS.Worksheet,
  issues: SheetIssue[],
  timezoneOffsetMinutes: number,
): SheetRow[] {
  const columns = SHEET_COLUMNS[sheet];
  const fieldsByIndex = resolveHeaderColumns(sheet, worksheet, issues);
  const rows: SheetRow[] = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // The header row.
    const decoded: SheetRow = {};
    let populated = false;
    for (const column of columns) {
      const index = fieldsByIndex.get(column.field);
      const raw = index === undefined ? null : cellValue(row.getCell(index));
      const context = { sheet, row: rowNumber, column, issues };
      const value = decodeCell(raw, context, timezoneOffsetMinutes);
      decoded[column.field] = value;
      if (value !== null && value !== undefined && value !== "") {
        populated = true;
      }
    }
    if (populated) rows.push(decoded);
  });

  return rows;
}

/** header text → column index, matched by `SHEET_COLUMNS` rather than by
 *  position: a user who inserted or deleted a column mid-file still gets a
 *  correct read. */
function resolveHeaderColumns(
  sheet: SheetName,
  worksheet: ExcelJS.Worksheet,
  issues: SheetIssue[],
): Map<string, number> {
  const known = headerToField(sheet);
  const byIndex = new Map<number, string>();
  const header = worksheet.getRow(1);

  header.eachCell({ includeEmpty: false }, (cell, index) => {
    const field = known.get(cellText(cell).trim());
    if (field) byIndex.set(index, field);
  });

  const present = new Set(byIndex.values());
  for (const headerText of REQUIRED_HEADERS[sheet] ?? []) {
    if (!present.has(known.get(headerText) ?? "")) {
      issues.push({
        sheet,
        row: 1,
        field: known.get(headerText) ?? headerText,
        header: headerText,
        message: `缺少必需的列「${headerText}」`,
      });
    }
  }

  const out = new Map<string, number>();
  for (const [index, field] of byIndex) out.set(field, index);
  return out;
}

type DecodeContext = {
  sheet: SheetName;
  row: number;
  column: SheetColumn;
  issues: SheetIssue[];
};

function decodeCell(
  raw: unknown,
  context: DecodeContext,
  timezoneOffsetMinutes: number,
): unknown {
  const { column, issues } = context;
  const fail = (message: string): null => {
    issues.push({
      sheet: context.sheet,
      row: context.row,
      field: column.field,
      header: column.header,
      message,
    });
    return null;
  };

  switch (column.kind) {
    case "money":
      return isBlank(raw)
        ? null
        : (parseYuanToCents(raw) ?? fail("金额不是数字"));
    case "int":
      return isBlank(raw) ? null : (parseInteger(raw) ?? fail("不是整数"));
    case "number": {
      if (isBlank(raw)) return null;
      const parsed = typeof raw === "number" ? raw : Number(raw);
      return Number.isFinite(parsed) ? parsed : fail("不是数字");
    }
    case "bool":
      return isBlank(raw) ? null : (parseBool(raw) ?? fail("不是布尔值"));
    case "list":
      return isBlank(raw) ? [] : splitList(String(raw));
    case "json": {
      if (isBlank(raw)) return null;
      if (typeof raw !== "string") return raw;
      try {
        return JSON.parse(raw);
      } catch {
        return fail("不是合法的 JSON");
      }
    }
    case "day":
      return isBlank(raw)
        ? null
        : (parseDayKey(raw, timezoneOffsetMinutes) ?? fail("不是有效的日期"));
    default:
      return parseText(raw);
  }
}

/** exceljs types its `load` buffer as a bare ArrayBuffer (and its own `Buffer`
 *  interface is `extends ArrayBuffer`), while everything here hands it bytes
 *  that may be a view onto a larger pooled Node buffer. Handing it an
 *  exactly-sized ArrayBuffer keeps both the types and the runtime happy. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer.slice(0);
}

function isBlank(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true;
  return typeof raw === "string" && raw.trim().length === 0;
}

/** ExcelJS hands a cell back as whatever the file holds: a string, a
 *  number, a Date, a formula result, or rich text. Flatten all of it. */
function cellValue(cell: ExcelJS.Cell): unknown {
  const value = cell.value as unknown;
  if (value === null || value === undefined) return null;
  if (
    value instanceof Date ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("result" in record) return record.result ?? null;
    if ("text" in record) return record.text;
    if ("richText" in record && Array.isArray(record.richText)) {
      return record.richText
        .map((part) => (part as { text?: string }).text ?? "")
        .join("");
    }
    if ("error" in record) return null;
  }
  return null;
}

function cellText(cell: ExcelJS.Cell): string {
  const value = cellValue(cell);
  if (value === null) return "";
  return typeof value === "string" ? value : String(value);
}
