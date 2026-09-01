import { z } from "@hono/zod-openapi";
import {
  deleteSuccessSchema,
  errorSchema,
  paginationQuerySchema,
} from "#lib/openapi";
import { ACCOUNT_TYPES, MAX_LINE_AMOUNT } from "../../domain";

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
      icon: z
        .string()
        .nullable()
        .openapi({ example: null, description: "Emoji or icon name" }),
      flags: z
        .array(z.string())
        .openapi({ example: [], description: 'e.g. "builtin"' }),
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
    // Project the entry belongs to; null = personal (not in any project).
    projectId: z.string().nullable().openapi({ example: "clx1234567890" }),
    project: z
      .object({
        id: z.string(),
        name: z.string().openapi({ example: "Kyoto Trip" }),
        status: z.string().openapi({ example: "active" }),
      })
      .nullable(),
    // False = excluded from ledger-wide surfaces (still fully visible in
    // its project and in balances). Forced false for guest-created entries;
    // editors may opt out per entry (e.g. credit-card repayments).
    countsInLedger: z.boolean().openapi({ example: true }),
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
    participantMemberId: z.string().optional(),
    projectId: z.string().optional(),
    accountId: z.string().optional().openapi({
      description:
        "Only entries with a line against this account id (category drill-down).",
    }),
    accountType: z.enum(ACCOUNT_TYPES).optional().openapi({
      description:
        "Only entries with a line against an account of this type (statement flow drill-down: expense vs income totals).",
    }),
    memberUserId: z.string().optional().openapi({
      description:
        "Only entries that involve this user in settlement terms: entries they created, entries tagged with them as a participant, and untagged entries (which split across all project members). Use together with projectId for a member's settlement drill-down.",
    }),
    includeExcluded: z.enum(["true", "false"]).optional().openapi({
      description:
        "Also return entries flagged countsInLedger=false (audit/search escape hatch for ledger-wide listing). Ignored when projectId is set — a project's books always show all of its entries.",
    }),
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
    accountId: z.string().min(1).nullish().openapi({
      example: "clx1234567890",
      description:
        "Account id. Omitted or null defers to the ledger's default pocket for this line's side (defaultCredit pays, defaultDebit receives).",
    }),
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
    // Optional project assignment. Guests must target one of their projects
    // and are restricted to expense categories.
    projectId: z.string().min(1).nullable().optional(),
    // Whether the entry counts in ledger-wide journal/statements. Defaults
    // to true; forced false for guests (their entries live in the project
    // books and settlement). On update, omitted = keep the current flag.
    countsInLedger: z.boolean().optional(),
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
    projectId?: string | null;
    project?: { id: string; name: string; status: string } | null;
    lines: Array<{
      id: string;
      accountId: string;
      account: {
        id: string;
        name: string | null;
        code: string | null;
        type: string;
        sortOrder: number;
        icon: string | null;
        flags: string[];
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
    projectId: entry.projectId ?? null,
    project: entry.project ?? null,
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
