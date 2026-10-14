import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  payloadTooLargeResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import {
  commitImport,
  previewToken as hashOf,
} from "../../transfer/import.service";
import { readUpload } from "../../transfer/zip";
import { commitImportFormSchema, commitImportResponseSchema } from "./schema";
import { parseTarget, readUploadedFile } from "./upload";

/**
 * Writes the plan the preview described. Idempotent in the sense that
 * matters: a merge skips what the fingerprint pass already matched, so
 * retrying after a partial failure imports the remainder rather than
 * doubling the ledger. Re-importing the same file into the same target
 * twice therefore lands nothing the second time.
 */
export const commitImportRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "commitQianlaiLedgerImport",
    method: "post",
    path: "/transfers/commit",
    tags: ["QianlaiTransfer"],
    summary: "Import a ledger export",
    description:
      "Creates a new ledger from the file, or merges it into the target one. " +
      'Omitting `target` (or passing "new") restores into a fresh ledger; passing ' +
      "a ledger id merges into it, reusing accounts by their stable code or " +
      "type+name and skipping entries already present. `previewToken` is the hash " +
      "the preview returned: the commit refuses a file that isn't byte-identical " +
      "to what was previewed. Row problems that don't block the whole file are " +
      "returned as `warnings`.",
    request: {
      body: {
        content: {
          "multipart/form-data": { schema: commitImportFormSchema },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      ...payloadTooLargeResponse,
      ...okResponseFn(commitImportResponseSchema, "What was imported"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const form = c.req.valid("form");
    const { bytes, file } = await readUploadedFile(form.file);

    if (form.previewToken && form.previewToken !== hashOf(bytes)) {
      throw new HTTPException(400, {
        message: "文件与预览时不一致，请重新预览后再导入",
      });
    }

    const target = parseTarget(form.target, form.ledgerName);
    const payload = await readUpload(bytes, file.name);
    const result = await commitImport(userId, payload, target);

    logAudit({
      event: "qianlai_ledger.imported",
      category: "qianlai_ledger",
      c,
      after: {
        ledgerId: result.ledgerId,
        mode: result.mode,
        source: payload.kind,
        ...result.created,
        skippedEntries: result.skipped.entries,
      },
    });

    return c.json(result, 200);
  },
});
