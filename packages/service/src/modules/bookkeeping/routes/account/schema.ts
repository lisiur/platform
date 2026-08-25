import { z } from "@hono/zod-openapi";
import type { BookAccount } from "#generated/prisma/client";
import { deleteSuccessSchema, errorSchema } from "#lib/openapi";
import { ACCOUNT_TYPES, MAX_LINE_AMOUNT } from "../../domain";
import { journalEntrySchema } from "../journal-entry/schema";

export { deleteSuccessSchema, errorSchema };

export const accountTypeEnumSchema = z.enum(ACCOUNT_TYPES);

/** Types a user may create directly; equity is system-managed. */
export const userAccountTypeEnumSchema = z.enum(
  ACCOUNT_TYPES.filter((t) => t !== "equity") as [string, ...string[]],
);

/** Shapes a raw BookAccount row into the OpenAPI response contract. */
export function serializeAccount(account: BookAccount) {
  return {
    ...account,
    type: account.type as (typeof ACCOUNT_TYPES)[number],
    status: account.status as "active" | "archived",
    meta: account.meta as Record<string, unknown> | null,
  };
}

export const accountMetaSchema = z.record(z.string(), z.unknown());

export const bookAccountSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    ledgerId: z.string().openapi({ example: "clx1234567890" }),
    name: z.string().nullable().openapi({
      example: null,
      description:
        "Custom display-name override; null renders the localized label for code",
    }),
    code: z.string().nullable().openapi({
      example: "cash",
      description:
        "i18n key for seeded accounts; null for user-created accounts (render name)",
    }),
    type: accountTypeEnumSchema,
    sortOrder: z.number().int().openapi({ example: 10 }),
    parentId: z.string().nullable().openapi({ example: null }),
    status: z.enum(["active", "archived"]).openapi({ example: "active" }),
    icon: z.string().nullable().openapi({ example: "💳" }),
    flags: z
      .array(z.string())
      .openapi({ example: [], description: "Behavior flags (e.g. builtin)" }),
    meta: accountMetaSchema
      .nullable()
      .openapi({ example: { cardNo: "6222 **** **** 1234" } }),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .openapi("QianlaiBookAccount");

export const listAccountsResponseSchema = z
  .object({
    accounts: bookAccountSchema.array(),
  })
  .openapi("QianlaiListAccountsResponse");

export const createAccountBodySchema = z
  .object({
    name: z.string().min(1).max(100).openapi({ example: "USD Cash" }),
    type: userAccountTypeEnumSchema,
    parentId: z.string().nullable().optional().openapi({ example: null }),
    icon: z.string().max(100).nullable().optional().openapi({ example: "💳" }),
    meta: accountMetaSchema.nullable().optional(),
  })
  .openapi("QianlaiCreateAccountBody");

export const updateAccountBodySchema = z
  .object({
    name: z.string().max(100).nullable().optional().openapi({
      example: "My Wallet",
      description:
        "Sets a custom display name; null or empty reverts to the localized label (coded accounts only)",
    }),
    parentId: z.string().nullable().optional(),
    status: z.enum(["active", "archived"]).optional(),
    icon: z.string().max(100).nullable().optional(),
    meta: accountMetaSchema.nullable().optional(),
  })
  .openapi("QianlaiUpdateAccountBody");

/**
 * Position is server-controlled (drag-to-reorder); sortOrder appears in the
 * reorder payload only, never in create/update bodies.
 */
export const reorderAccountsBodySchema = z
  .object({
    items: z
      .array(
        z.object({
          id: z.string().min(1).openapi({ example: "clx1234567890" }),
          parentId: z.string().nullable().openapi({ example: null }),
          sortOrder: z.number().int().min(0).openapi({ example: 2 }),
        }),
      )
      .min(1)
      .max(200),
  })
  .openapi("QianlaiReorderAccountsBody");

export const reorderAccountsResponseSchema = z
  .object({
    accounts: bookAccountSchema.array(),
  })
  .openapi("QianlaiReorderAccountsResponse");

export const ledgerIdParamSchema = z.object({
  ledgerId: z.string().min(1).openapi({ example: "clx1234567890" }),
});

export const accountIdParamSchema = z.object({
  ledgerId: z.string().min(1).openapi({ example: "clx1234567890" }),
  id: z.string().min(1).openapi({ example: "clx1234567890" }),
});

export const setBalanceBodySchema = z
  .object({
    /** Target signed balance as of `date` (credit-normal for liabilities). */
    balance: z.number().min(0).max(MAX_LINE_AMOUNT).openapi({ example: 1250 }),
    /** As-of day (UTC midnight) the balance applies to; defaults to today. */
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .openapi({ example: "2026-08-24" }),
    memo: z.string().max(500).optional(),
  })
  .openapi("QianlaiSetBalanceBody");

export const setBalanceResponseSchema = z
  .object({
    /** False when the account already had the target balance (no-op). */
    adjusted: z.boolean().openapi({ example: true }),
    /** The posted adjustment entry, or null when nothing was adjusted. */
    entry: journalEntrySchema.nullable(),
  })
  .openapi("QianlaiSetBalanceResponse");
