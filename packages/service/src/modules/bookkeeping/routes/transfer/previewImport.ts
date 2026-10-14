import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  payloadTooLargeResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import {
  previewToken as hashOf,
  previewImport,
} from "../../transfer/import.service";
import { readUpload } from "../../transfer/zip";
import { importFormSchema, importPreviewResponseSchema } from "./schema";
import { parseTarget, readUploadedFile } from "./upload";

/**
 * The dry run. Parses the upload, resolves it against the target, and
 * reports what a commit would do — without writing anything. The returned
 * `previewToken` binds the commit to this exact file.
 */
export const previewImportRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "previewQianlaiLedgerImport",
    method: "post",
    path: "/transfers/preview",
    tags: ["QianlaiTransfer"],
    summary: "Preview a ledger import",
    description:
      "Uploads a ledger export (.zip backup, .xlsx workbook or data.json) and " +
      "reports what importing it would do: which accounts and projects would be " +
      "reused or created, how each person resolves, how many entries would be " +
      "created, skipped as duplicates (merge mode) or rejected, and every row " +
      "problem with its row number. Writes nothing. Send the `previewToken` back " +
      "with the commit, which refuses a file that isn't byte-identical to this one.",
    request: {
      body: {
        content: {
          "multipart/form-data": { schema: importFormSchema },
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
      ...okResponseFn(importPreviewResponseSchema, "The import plan"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const form = c.req.valid("form");
    const { bytes, file } = await readUploadedFile(form.file);
    const target = parseTarget(form.target, form.ledgerName);
    const payload = await readUpload(bytes, file.name);

    const plan = await previewImport(userId, payload, target);
    const days = plan.document.entries.map((entry) => entry.dayKey).sort();

    return c.json(
      {
        source: plan.source,
        formatVersion: plan.document.formatVersion,
        ledger: {
          name: plan.document.ledgerName,
          currency: plan.document.currency,
          entries: plan.document.entries.length,
          accounts: plan.document.accounts.length,
          projects: plan.document.projects.length,
          people: plan.document.people.length,
          from: days[0] ?? null,
          to: days[days.length - 1] ?? null,
        },
        target: {
          mode: target.mode,
          ledgerId: target.mode === "merge" ? target.ledgerId : null,
        },
        accounts: plan.accounts,
        projects: plan.projects,
        people: plan.people,
        entries: plan.entries,
        photos: plan.photos,
        issues: plan.issues,
        blocking: plan.blocking,
        previewToken: hashOf(bytes),
      },
      200,
    );
  },
});
