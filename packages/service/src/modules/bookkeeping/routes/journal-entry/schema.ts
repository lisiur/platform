import { z } from "@hono/zod-openapi";
import {
  deleteSuccessSchema,
  errorSchema,
  paginationQuerySchema,
} from "#lib/openapi";
import { MAX_LINE_AMOUNT } from "../../domain";

export { deleteSuccessSchema, errorSchema };

export const journalLineSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    accountId: z.string().openapi({ example: "clx1234567890" }),
    account: z.object({
      id: z.string(),
      code: z.string().openapi({ example: "1001" }),
      name: z.string().openapi({ example: "Cash" }),
      type: z.string().openapi({ example: "asset" }),
    }),
    debit: z.number().openapi({ example: 50 }),
    credit: z.number().openapi({ example: 0 }),
    memo: z.string().nullable().openapi({ example: null }),
  })
  .openapi("QianlaiJournalLine");

export const journalEntrySchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    ledgerId: z.string().openapi({ example: "clx1234567890" }),
    entryNo: z.number().int().openapi({ example: 1 }),
    date: z.date(),
    memo: z.string().nullable().openapi({ example: "Groceries" }),
    status: z.string().openapi({ example: "posted" }),
    // Nullable: a creator who deleted their account leaves the entry intact
    // with a null creator reference (FK is SetNull).
    createdById: z.string().nullable().openapi({ example: "clx1234567890" }),
    createdBy: z
      .object({
        id: z.string(),
        name: z.string().openapi({ example: "Alice" }),
        email: z.string().nullable(),
        avatar: z.string().nullable(),
      })
      .nullable(),
    createdAt: z.date(),
    lines: journalLineSchema.array(),
  })
  .openapi("QianlaiJournalEntry");

export const listEntriesQuerySchema = paginationQuerySchema
  .extend({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    q: z.string().optional(),
  })
  .openapi("QianlaiListEntriesQuery");

export const listEntriesResponseSchema = z
  .object({
    entries: journalEntrySchema.array(),
    total: z.number().int(),
  })
  .openapi("QianlaiListEntriesResponse");

export const journalLineInputSchema = z
  .object({
    accountId: z.string().min(1),
    debit: z
      .number()
      .min(0)
      .max(MAX_LINE_AMOUNT)
      .default(0)
      .openapi({ example: 50 }),
    credit: z
      .number()
      .min(0)
      .max(MAX_LINE_AMOUNT)
      .default(0)
      .openapi({ example: 0 }),
    memo: z.string().max(500).optional(),
  })
  .openapi("QianlaiJournalLineInput");

export const createEntryBodySchema = z
  .object({
    date: z.coerce.date().openapi({ example: "2026-08-22T00:00:00.000Z" }),
    memo: z.string().max(500).optional(),
    lines: z.array(journalLineInputSchema).min(2).max(50),
  })
  .openapi("QianlaiCreateEntryBody");

export const ledgerIdParamSchema = z.object({
  ledgerId: z.string().min(1).openapi({ example: "clx1234567890" }),
});

export const entryIdParamSchema = z.object({
  ledgerId: z.string().min(1).openapi({ example: "clx1234567890" }),
  id: z.string().min(1).openapi({ example: "clx1234567890" }),
});

/** Serializes Decimal debit/credit to numbers for JSON transport. */
export function serializeEntry<
  T extends {
    id: string;
    ledgerId: string;
    entryNo: number;
    date: Date;
    memo: string | null;
    status: string;
    createdById: string | null;
    createdAt: Date;
    createdBy: unknown;
    lines: Array<{
      id: string;
      accountId: string;
      account: { id: string; code: string; name: string; type: string };
      debit: { toString(): string };
      credit: { toString(): string };
      memo: string | null;
    }>;
  },
>(entry: T) {
  return {
    ...entry,
    lines: entry.lines.map((line) => ({
      ...line,
      debit: Number(line.debit),
      credit: Number(line.credit),
    })),
  };
}
