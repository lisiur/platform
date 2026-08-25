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
      name: z.string().nullable().openapi({ example: null }),
      code: z
        .string()
        .nullable()
        .openapi({ example: "cash", description: "i18n key, null if custom" }),
      type: z.string().openapi({ example: "asset" }),
      sortOrder: z.number().int().openapi({ example: 10 }),
    }),
    debit: z.number().openapi({ example: 50 }),
    credit: z.number().openapi({ example: 0 }),
    memo: z.string().nullable().openapi({ example: null }),
  })
  .openapi("QianlaiJournalLine");

/** Which ledger member an entry concerns; feeds member turnover reports. */
export const journalEntryParticipantSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    ledgerMemberId: z.string().openapi({ example: "clx1234567890" }),
    // Owner-only, same redaction policy as entry creators' emails.
    user: z.object({
      id: z.string(),
      name: z.string().openapi({ example: "Alice" }),
      email: z.string().nullable(),
      avatar: z.string().nullable(),
    }),
  })
  .openapi("QianlaiJournalEntryParticipant");

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
    participants: journalEntryParticipantSchema.array(),
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
    // Optional ledger-member ids this entry concerns; must be members of the
    // ledger. Repeats are collapsed server-side.
    participantMemberIds: z.array(z.string().min(1)).max(20).optional(),
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
      account: {
        id: string;
        name: string | null;
        code: string | null;
        type: string;
        sortOrder: number;
      };
      debit: { toString(): string };
      credit: { toString(): string };
      memo: string | null;
    }>;
    participants?: Array<{
      id: string;
      ledgerMemberId: string;
      ledgerMember: {
        user: {
          id: string;
          name: string;
          email: string | null;
          avatar: string | null;
        };
      };
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
    participants: (entry.participants ?? []).map((participant) => ({
      id: participant.id,
      ledgerMemberId: participant.ledgerMemberId,
      user: participant.ledgerMember.user,
    })),
  };
}
