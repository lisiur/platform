import { z } from "@hono/zod-openapi";
import { LEDGER_EXPORT_FORMAT_VERSION } from "../../transfer/format";

export const ledgerIdParamSchema = z.object({
  ledgerId: z.string().min(1).openapi({ example: "clx1234567890" }),
});

/**
 * `tzOffsetMinutes` is the same convention the report routes use: the
 * service stores instants and has no calendar of its own, so the client
 * says which calendar its 日期 column should be written in. It lands in the
 * document too, which is how a spreadsheet-only import turns those days
 * back into the same instants.
 */
export const exportLedgerQuerySchema = z
  .object({
    format: z.enum(["zip", "xlsx"]).default("zip").openapi({
      description:
        "zip = the full backup (workbook + lossless document + photos); xlsx = the workbook alone, no photos.",
    }),
    includePhotos: z
      .enum(["true", "false"])
      .default("true")
      .openapi({ description: "Only meaningful for format=zip." }),
    from: z.coerce.date().optional().openapi({
      description: "Earliest posting instant to include.",
    }),
    to: z.coerce.date().optional().openapi({
      description: "Latest posting instant to include.",
    }),
    tzOffsetMinutes: z.coerce.number().int().min(-840).max(840).default(0),
  })
  .openapi("QianlaiExportLedgerQuery");

const fileField = z.any().openapi({
  description:
    "The export archive (.zip), the workbook (.xlsx), or a bare data.json.",
});

export const importFormSchema = z.object({
  file: fileField,
  target: z.string().optional().openapi({
    description:
      'Omit or "new" to create a ledger; otherwise the target ledger id (merge).',
  }),
  ledgerName: z.string().optional().openapi({
    description: "Name for the ledger a restore creates.",
  }),
});

export const commitImportFormSchema = importFormSchema.extend({
  previewToken: z.string().optional().openapi({
    description:
      "The hash the preview returned. Refuses a file that isn't byte-identical to the previewed one.",
  }),
});

const resolution = {
  key: z.string(),
  action: z.enum(["reuse", "create", "drop"] as const),
  targetId: z.string().optional().openapi({
    description:
      "Where it lands in the target ledger; absent = will be created.",
  }),
};

const resolvedRowSchema = z.object({
  ...resolution,
  label: z.string().openapi({ description: "Account name or code." }),
});

const resolvedProjectSchema = z.object({
  ...resolution,
  name: z.string(),
});

const resolvedPersonSchema = z.object({
  ...resolution,
  name: z.string(),
  email: z.string().nullable(),
});

const importIssueSchema = z.object({
  where: z.string(),
  message: z.string(),
});

export const importPreviewResponseSchema = z
  .object({
    source: z.enum(["archive", "workbook", "document"]),
    formatVersion: z.number().int().openapi({
      example: LEDGER_EXPORT_FORMAT_VERSION,
    }),
    ledger: z.object({
      name: z.string().nullable(),
      currency: z.string(),
      entries: z.number().int(),
      accounts: z.number().int(),
      projects: z.number().int(),
      people: z.number().int(),
      from: z.string().nullable(),
      to: z.string().nullable(),
    }),
    target: z.object({
      mode: z.enum(["new", "merge"]),
      ledgerId: z.string().nullable(),
    }),
    accounts: resolvedRowSchema.array(),
    projects: resolvedProjectSchema.array(),
    people: resolvedPersonSchema.array(),
    entries: z.object({
      total: z.number().int(),
      importable: z.number().int(),
      duplicates: z.number().int().openapi({
        description: "Merge mode only: entries already in the target ledger.",
      }),
      invalid: z.number().int(),
    }),
    photos: z.object({
      count: z.number().int(),
      bytes: z.number().int(),
      missing: z.string().array(),
    }),
    issues: importIssueSchema.array(),
    blocking: z.string().array(),
    previewToken: z.string(),
  })
  .openapi("QianlaiImportPreview");

export const commitImportResponseSchema = z
  .object({
    ledgerId: z.string(),
    mode: z.enum(["new", "merge"]),
    created: z.object({
      accounts: z.number().int(),
      projects: z.number().int(),
      people: z.number().int(),
      entries: z.number().int(),
      photos: z.number().int(),
    }),
    skipped: z.object({ entries: z.number().int() }),
    warnings: z.string().array(),
  })
  .openapi("QianlaiImportResult");
