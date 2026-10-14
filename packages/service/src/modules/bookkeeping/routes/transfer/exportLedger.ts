import { Readable } from "node:stream";
import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { MAX_EXPORT_PHOTO_BYTES } from "#lib/constants";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  payloadTooLargeResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { openUploadStream } from "#modules/attachment/attachment.service";
import { requireLedgerAccess } from "../../access";
import { buildLedgerExport } from "../../transfer/export.service";
import { MAX_IMPORT_ENTRIES } from "../../transfer/import.service";
import { buildWorkbook } from "../../transfer/xlsx";
import {
  createArchive,
  DOCUMENT_ENTRY,
  MANIFEST_ENTRY,
  WORKBOOK_ENTRY,
} from "../../transfer/zip";
import { exportLedgerQuerySchema, ledgerIdParamSchema } from "./schema";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Streams a ledger out as one file. `zip` is the backup (workbook +
 * lossless document + receipts), `xlsx` is the workbook alone.
 *
 * Streaming rather than buffering the whole archive: photos are read off
 * disk one at a time and piped into the zip, so a ledger with a few
 * hundred receipts costs the same memory as one with none. What is built in
 * memory is the workbook, which is bounded by the entry cap below.
 */
export const exportLedgerRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "exportQianlaiLedger",
    method: "get",
    path: "/ledgers/{ledgerId}/export",
    tags: ["QianlaiTransfer"],
    summary: "Export a ledger as a backup archive or a workbook",
    description:
      "Exports the whole ledger — accounts, entries and their lines, projects, " +
      "members, budgets, real accounts and the exporting user's ledger preferences — " +
      "as a .zip (workbook + lossless data.json + photo receipts) or as the .xlsx " +
      "workbook alone. Editors and owners only; archived ledgers export fine, " +
      "since this only reads. `tzOffsetMinutes` is the client's calendar offset, " +
      "used for the workbook's 日期 column (the document keeps exact instants). " +
      "Entries beyond the cap are refused rather than silently truncated — narrow " +
      "the range with from/to.",
    request: {
      params: ledgerIdParamSchema,
      query: exportLedgerQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      ...payloadTooLargeResponse,
      200: {
        description:
          "The file. Content-Disposition carries the ledger name; content-type is the archive's or the workbook's.",
        content: {
          "application/zip": { schema: { type: "string", format: "binary" } },
          [XLSX_MIME]: { schema: { type: "string", format: "binary" } },
        },
      },
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId } = c.req.valid("param");
    const query = c.req.valid("query");

    const access = await requireLedgerAccess(userId, ledgerId, "editor");

    const result = await buildLedgerExport(userId, access, {
      tzOffsetMinutes: query.tzOffsetMinutes,
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
      includePhotos: query.format === "zip" && query.includePhotos === "true",
    });

    if (result.entryCount > MAX_IMPORT_ENTRIES) {
      throw new HTTPException(413, {
        message: `流水条数 ${result.entryCount} 超过 ${MAX_IMPORT_ENTRIES} 上限，请用 from/to 缩小时间范围`,
      });
    }
    // An archive bigger than the import's own body cap would be a file
    // restore refuses, so the export says so here instead of handing over
    // something unusable. Measured whether or not photos are included — the
    // receipts still exist, and the fix (the workbook format) is the same
    // either way.
    if (
      query.format === "zip" &&
      query.includePhotos === "true" &&
      result.photoBytes > MAX_EXPORT_PHOTO_BYTES
    ) {
      throw new HTTPException(413, {
        message: `票据照片共 ${(result.photoBytes / 1024 / 1024).toFixed(1)}MB，超过 ${MAX_EXPORT_PHOTO_BYTES / 1024 / 1024}MB 上限，请改用 Excel 表格导出或缩小时间范围`,
      });
    }

    logAudit({
      event: "qianlai_ledger.exported",
      category: "qianlai_ledger",
      c,
      after: {
        ledgerId,
        format: query.format,
        entries: result.entryCount,
        photos: result.photoCount,
        photoBytes: result.photoBytes,
      },
    });

    const workbook = await buildWorkbook(result.rows);
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

    if (query.format === "xlsx") {
      return c.body(new Uint8Array(workbook), 200, {
        "content-type": XLSX_MIME,
        "content-disposition": contentDisposition(
          `${access.ledger.name} ${stamp}.xlsx`,
          `qianlai-ledger-${stamp}.xlsx`,
        ),
        "content-length": String(workbook.length),
      });
    }

    const archive = createArchive();
    archive.append(JSON.stringify(manifestOf(result)), {
      name: MANIFEST_ENTRY,
    });
    archive.append(JSON.stringify(result.document), { name: DOCUMENT_ENTRY });
    archive.append(Buffer.from(workbook), { name: WORKBOOK_ENTRY });
    for (const photo of result.photoFiles) {
      archive.append(openUploadStream(photo.path), { name: photo.entryName });
    }
    // finalize() seals the archive; the instance itself is the readable
    // side, so that's what becomes the response body. Its promise is
    // deliberately not awaited — it resolves when the LAST entry is done,
    // long after the response has started — so the failure path is an
    // `error` event instead: a receipt missing off disk surfaces in the log
    // rather than as an unhandled rejection.
    archive.on("error", (error) => {
      console.error(
        `[export] ledger ${ledgerId} archive failed mid-stream:`,
        error,
      );
    });
    void archive.finalize().catch(() => {
      // Already logged above; nothing left to do but not fall over.
    });
    const body = Readable.toWeb(archive) as ReadableStream<Uint8Array>;

    return c.body(body, 200, {
      "content-type": "application/zip",
      "content-disposition": contentDisposition(
        `${access.ledger.name} ${stamp}.zip`,
        `qianlai-ledger-${stamp}.zip`,
      ),
    });
  },
});

function manifestOf(result: {
  document: {
    formatVersion: number;
    exportedAt: string;
    ledger: { name: string };
  };
  entryCount: number;
  photoCount: number;
}) {
  return {
    formatVersion: result.document.formatVersion,
    exportedAt: result.document.exportedAt,
    ledgerName: result.document.ledger.name,
    entries: result.entryCount,
    photos: result.photoCount,
    files: [MANIFEST_ENTRY, DOCUMENT_ENTRY, WORKBOOK_ENTRY, "photos/"],
  };
}

/** RFC 6266: an ASCII fallback for clients that don't decode `filename*`,
 *  plus the UTF-8 name for the ones that do. */
function contentDisposition(name: string, fallback: string) {
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
