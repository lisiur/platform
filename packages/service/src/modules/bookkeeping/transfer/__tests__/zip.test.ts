import { ZipArchive } from "archiver";
import { describe, expect, it } from "vitest";
import { LEDGER_EXPORT_FORMAT_VERSION, SHEET_ORDER } from "../format";
import { buildWorkbook, type WorkbookRows } from "../xlsx";
import {
  classifyUpload,
  DOCUMENT_ENTRY,
  MANIFEST_ENTRY,
  PHOTO_PREFIX,
  photoEntryName,
  readUpload,
  WORKBOOK_ENTRY,
} from "../zip";

async function zipOf(
  files: Array<{ name: string; body: string | Uint8Array }>,
): Promise<Buffer> {
  const archive = new ZipArchive({ zlib: { level: 1 } });
  for (const file of files) {
    archive.append(
      typeof file.body === "string"
        ? Buffer.from(file.body)
        : Buffer.from(file.body),
      {
        name: file.name,
      },
    );
  }
  void archive.finalize();
  const chunks: Buffer[] = [];
  for await (const chunk of archive) {
    chunks.push(Buffer.from(chunk as Buffer));
  }
  return Buffer.concat(chunks);
}

/** A workbook with one row on the ledger sheet and nothing else — enough to
 *  make a real .xlsx for the classifier to look inside. */
function oneRowWorkbook(name: string): WorkbookRows {
  const rows = Object.fromEntries(
    SHEET_ORDER.map((sheet) => [sheet, []]),
  ) as unknown as WorkbookRows;
  rows.ledger = [{ name, timezoneOffsetMinutes: 480 }];
  return rows;
}

const document = {
  formatVersion: LEDGER_EXPORT_FORMAT_VERSION,
  exportedAt: "2026-08-22T10:00:00.000Z",
  timezoneOffsetMinutes: 480,
  ledger: {
    key: "led_1",
    name: "家庭账本",
    description: null,
    currency: "CNY",
    status: "active",
    isDefault: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  budgetExcludedAccountKeys: [],
  accounts: [],
  entries: [],
  projects: [],
  members: [],
  budgets: [],
  realAccounts: [],
  preferences: [],
};

describe("upload classification", () => {
  it("tells an archive from a bare workbook by what is inside", async () => {
    const archive = await zipOf([
      { name: DOCUMENT_ENTRY, body: JSON.stringify(document) },
      { name: WORKBOOK_ENTRY, body: "xlsx-bytes" },
    ]);
    expect(await classifyUpload(archive, "anything.zip")).toBe("archive");

    const workbook = await buildWorkbook(oneRowWorkbook("x"));
    expect(await classifyUpload(Buffer.from(workbook), "book.xlsx")).toBe(
      "workbook",
    );
  });

  it("recognises a bare data.json without unzipping it", async () => {
    const bytes = Buffer.from(JSON.stringify(document), "utf8");
    expect(await classifyUpload(bytes, "data.json")).toBe("document");
  });

  it("refuses a zip with neither half", async () => {
    const zip = await zipOf([{ name: "readme.txt", body: "hi" }]);
    await expect(classifyUpload(zip, "x.zip")).rejects.toThrow(/data\.json/);
  });

  it("refuses a file it cannot read at all", async () => {
    await expect(
      classifyUpload(Buffer.from("not a ledger file"), "notes.txt"),
    ).rejects.toThrow(/无法识别的文件格式/);
  });
});

describe("archive reading", () => {
  it("hands back the document, the workbook and the photos", async () => {
    const workbook = await buildWorkbook(oneRowWorkbook("家庭账本"));
    const photoName = photoEntryName(7, 1, "jpg").slice(PHOTO_PREFIX.length);
    const zip = await zipOf([
      { name: MANIFEST_ENTRY, body: JSON.stringify({ entries: 0 }) },
      { name: DOCUMENT_ENTRY, body: JSON.stringify(document) },
      { name: WORKBOOK_ENTRY, body: workbook },
      { name: photoEntryName(7, 1, "jpg"), body: new Uint8Array([0xff, 0xd8]) },
    ]);

    const payload = await readUpload(zip, "backup.zip");
    expect(payload.kind).toBe("archive");
    expect(payload.document?.ledger.name).toBe("家庭账本");
    expect(payload.workbook).not.toBeNull();
    // Photos are keyed by their bare name, which is what data.json carries.
    expect([...payload.photos.keys()]).toEqual([photoName]);
  });

  it("drops entries that try to escape the archive root", async () => {
    const zip = await zipOf([
      { name: DOCUMENT_ENTRY, body: JSON.stringify(document) },
      { name: "../escape.jpg", body: "nope" },
    ]);
    const payload = await readUpload(zip, "backup.zip");
    expect(payload.photos.size).toBe(0);
  });

  it("refuses a document written by a newer app", async () => {
    const zip = await zipOf([
      {
        name: DOCUMENT_ENTRY,
        body: JSON.stringify({ ...document, formatVersion: 99 }),
      },
    ]);
    await expect(readUpload(zip, "backup.zip")).rejects.toThrow(/高于当前应用/);
  });

  it("refuses a document whose shape it doesn't know", async () => {
    const zip = await zipOf([
      { name: DOCUMENT_ENTRY, body: JSON.stringify({ formatVersion: 1 }) },
    ]);
    await expect(readUpload(zip, "backup.zip")).rejects.toThrow(/结构不符合/);
  });
});
