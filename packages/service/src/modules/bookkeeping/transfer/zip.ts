import { ZipArchive } from "archiver";
import { HTTPException } from "hono/http-exception";
import yauzl from "yauzl";
import {
  LEDGER_EXPORT_FORMAT_VERSION,
  type LedgerExportDocument,
  ledgerExportDocumentSchema,
  photoFileName,
} from "./format";

/**
 * The archive container. A ledger export is one file the user can drop in
 * a chat app and move to another device, so the workbook, the lossless
 * document and the receipt photos ship together inside a zip.
 *
 * Entry names are ASCII (`ledger.xlsx`, not `账本.xlsx`) on purpose: zip
 * filenames are the one part of the format still encoded by flag rather
 * than by a standard, and a Chinese name that some unzip tools mangle is a
 * support ticket. The workbook's own headers are UTF-8 XML and safe.
 */

/** JSON pointer file inside the archive. */
export const MANIFEST_ENTRY = "manifest.json";
export const DOCUMENT_ENTRY = "data.json";
export const WORKBOOK_ENTRY = "ledger.xlsx";
export const PHOTO_PREFIX = "photos/";

export const MAX_ARCHIVE_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_ARCHIVE_TOTAL_BYTES = 64 * 1024 * 1024;

/** What the user actually handed us, decided by content rather than by the
 *  filename (which "Keynote 1" and friends routinely rewrite). */
export type UploadKind = "archive" | "workbook" | "document";

export type UploadPayload = {
  kind: UploadKind;
  /** `archive` only: the workbook the user may have edited. */
  workbook: Uint8Array | null;
  /** `archive` / `document`: the lossless document. */
  document: LedgerExportDocument | null;
  /** `archive` only: file name → bytes. */
  photos: Map<string, Buffer>;
};

export function createArchive(): ZipArchive {
  return new ZipArchive({ zlib: { level: 6 } });
}

export function photoEntryName(entryNo: number, index: number, ext: string) {
  return `${PHOTO_PREFIX}${photoFileName(entryNo, index, ext)}`;
}

/**
 * Classifies the upload. `.xlsx` IS a zip, so its entries have to be read
 * to tell an archive from a bare workbook; a bare `data.json` needs no
 * unzipping at all.
 */
export async function classifyUpload(
  bytes: Buffer,
  fileName: string,
): Promise<UploadKind> {
  if (isZip(bytes)) {
    const names = await entryNames(bytes);
    if (names.some((name) => name.startsWith("xl/"))) return "workbook";
    if (names.includes(DOCUMENT_ENTRY)) return "archive";
    throw new HTTPException(400, {
      message: `压缩包里没有 ${DOCUMENT_ENTRY}，请选择潜望导出的备份包`,
    });
  }
  if (bytes.subarray(0, 1).toString("utf8") === "{") return "document";
  throw new HTTPException(400, {
    message: `无法识别的文件格式${fileName ? `（${fileName}）` : ""}，请选择 .zip 备份包或 .xlsx 表格`,
  });
}

export async function readUpload(
  bytes: Buffer,
  fileName: string,
): Promise<UploadPayload> {
  const kind = await classifyUpload(bytes, fileName);
  const payload: UploadPayload = {
    kind,
    workbook: null,
    document: null,
    photos: new Map(),
  };

  if (kind === "document") {
    payload.document = parseDocument(bytes);
    return payload;
  }

  for (const entry of await readEntries(bytes)) {
    if (entry.name === DOCUMENT_ENTRY) {
      payload.document = parseDocument(entry.buffer);
    } else if (entry.name === WORKBOOK_ENTRY || entry.name.endsWith(".xlsx")) {
      payload.workbook = entry.buffer;
    } else if (entry.name.startsWith(PHOTO_PREFIX)) {
      payload.photos.set(entry.name.slice(PHOTO_PREFIX.length), entry.buffer);
    }
  }

  // A zip that parsed but carried neither half is an import we can do
  // nothing with — say so instead of creating an empty ledger.
  if (!payload.document && !payload.workbook) {
    throw new HTTPException(400, { message: "文件里没有可导入的数据" });
  }
  return payload;
}

function parseDocument(bytes: Buffer): LedgerExportDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new HTTPException(400, {
      message: `${DOCUMENT_ENTRY} 不是合法的 JSON`,
    });
  }
  const parsed = ledgerExportDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: `${DOCUMENT_ENTRY} 的结构不符合导出格式：${parsed.error.issues[0]?.message ?? "未知字段"}`,
    });
  }
  if (parsed.data.formatVersion > LEDGER_EXPORT_FORMAT_VERSION) {
    throw new HTTPException(400, {
      message: `文件版本 ${parsed.data.formatVersion} 高于当前应用支持的版本，请升级应用后再导入`,
    });
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// zip plumbing
// ---------------------------------------------------------------------------

function isZip(bytes: Buffer): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

type ZipEntry = { name: string; buffer: Buffer };

async function entryNames(bytes: Buffer): Promise<string[]> {
  const zipfile = await openZip(bytes);
  const names: string[] = [];
  await eachEntry(zipfile, (entry) => {
    names.push(entry.fileName);
  });
  return names;
}

async function readEntries(bytes: Buffer): Promise<ZipEntry[]> {
  const zipfile = await openZip(bytes);
  const entries: ZipEntry[] = [];
  let total = 0;

  await eachEntry(zipfile, async (entry) => {
    if (entry.fileName.endsWith("/")) return;
    const name = normalizeEntryName(entry.fileName);
    // Traversal segments are dropped: import hands these bytes straight to
    // the attachment layer without writing them, but a future on-disk
    // extraction inherits the guarantee for free.
    if (name === null) return;
    if (
      name.startsWith(PHOTO_PREFIX) &&
      entry.uncompressedSize > MAX_ARCHIVE_PHOTO_BYTES
    ) {
      throw new HTTPException(400, {
        message: `照片 ${name} 超过 ${MAX_ARCHIVE_PHOTO_BYTES / 1024 / 1024}MB 上限`,
      });
    }
    total += entry.uncompressedSize;
    if (total > MAX_ARCHIVE_TOTAL_BYTES) {
      throw new HTTPException(413, { message: "文件解压后超过 64MB 上限" });
    }
    entries.push({ name, buffer: await readEntryBytes(zipfile, entry) });
  });

  return entries;
}

function normalizeEntryName(name: string): string | null {
  const normalized = name.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.split("/").some((part) => part === "..")) return null;
  return normalized;
}

function openZip(bytes: Buffer): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true }, (error, zipfile) => {
      if (error || !zipfile) {
        reject(
          new HTTPException(400, {
            message: "压缩包已损坏或不是有效的 zip 文件",
          }),
        );
        return;
      }
      resolve(zipfile);
    });
  });
}

function eachEntry(
  zipfile: yauzl.ZipFile,
  visit: (entry: yauzl.Entry) => Promise<void> | void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    zipfile.on("error", reject);
    zipfile.on("end", resolve);
    zipfile.on("entry", (entry) => {
      Promise.resolve(visit(entry))
        .then(() => zipfile.readEntry())
        .catch(reject);
    });
    zipfile.readEntry();
  });
}

function readEntryBytes(zipfile: yauzl.ZipFile, entry: yauzl.Entry) {
  return new Promise<Buffer>((resolve, reject) => {
    zipfile.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(
          new HTTPException(400, {
            message: `无法读取压缩包条目 ${entry.fileName}`,
          }),
        );
        return;
      }
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("error", reject);
      stream.on("end", () => resolve(Buffer.concat(chunks)));
    });
  });
}
