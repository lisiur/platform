import { z } from "@hono/zod-openapi";
import type { RealAccount } from "#generated/prisma/client";
import { deleteSuccessSchema, errorSchema, idParamSchema } from "#lib/openapi";
import { REAL_ACCOUNT_TYPES } from "../../domain";

export { deleteSuccessSchema, errorSchema };

export const realAccountTypeEnumSchema = z.enum(REAL_ACCOUNT_TYPES);

export const realAccountMetaSchema = z.record(z.string(), z.unknown());

/** Shapes a raw RealAccount row into the OpenAPI response contract. */
export function serializeRealAccount(account: RealAccount) {
  return {
    ...account,
    type: account.type as (typeof REAL_ACCOUNT_TYPES)[number],
    status: account.status as "active" | "archived",
    meta: account.meta as Record<string, unknown> | null,
  };
}

export const realAccountSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    name: z.string().openapi({ example: "CMB Savings Card" }),
    type: realAccountTypeEnumSchema,
    status: z.enum(["active", "archived"]).openapi({ example: "active" }),
    icon: z.string().nullable().openapi({ example: "🏦" }),
    meta: realAccountMetaSchema
      .nullable()
      .openapi({ example: { cardNo: "6222 **** **** 1234" } }),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .openapi("QianlaiRealAccount");

/** A ledger's slice of a master account, with its in-ledger balance only. */
export const realAccountPocketSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    ledgerId: z.string().openapi({ example: "clx1234567890" }),
    ledgerName: z.string().openapi({ example: "Family" }),
    ledgerStatus: z.enum(["active", "archived"]).openapi({ example: "active" }),
    name: z.string().nullable().openapi({ example: "Bank Card" }),
    code: z.string().nullable().openapi({ example: "bankCard" }),
    type: realAccountTypeEnumSchema,
    status: z.enum(["active", "archived"]).openapi({ example: "active" }),
    icon: z.string().nullable().openapi({ example: "🏦" }),
    /** Signed balance of this pocket within its own ledger. */
    balance: z.number().openapi({ example: 8000 }),
  })
  .openapi("QianlaiRealAccountPocket");

export const realAccountWithPocketsSchema = realAccountSchema
  .extend({
    /** Cross-ledger sum over membership-visible pockets. */
    balance: z.number().openapi({ example: 63900 }),
    pockets: realAccountPocketSchema.array(),
  })
  .openapi("QianlaiRealAccountWithPockets");

export const listRealAccountsResponseSchema = z
  .object({
    realAccounts: realAccountWithPocketsSchema.array(),
    totals: z
      .object({
        /** Active masters only; archived masters stay listed but excluded. */
        assets: z.number().openapi({ example: 63900 }),
        liabilities: z.number().openapi({ example: 1200 }),
        netWorth: z.number().openapi({ example: 62700 }),
      })
      .openapi("QianlaiRealAccountTotals"),
  })
  .openapi("QianlaiListRealAccountsResponse");

export const createRealAccountBodySchema = z
  .object({
    name: z.string().min(1).max(100).openapi({ example: "CMB Savings Card" }),
    type: realAccountTypeEnumSchema,
    icon: z.string().max(100).nullable().optional().openapi({ example: "🏦" }),
    meta: realAccountMetaSchema.nullable().optional(),
  })
  .openapi("QianlaiCreateRealAccountBody");

export const updateRealAccountBodySchema = z
  .object({
    name: z.string().min(1).max(100).optional().openapi({
      example: "CMB Savings Card",
    }),
    status: z.enum(["active", "archived"]).optional(),
    icon: z.string().max(100).nullable().optional().openapi({ example: "🏦" }),
    meta: realAccountMetaSchema.nullable().optional(),
  })
  .openapi("QianlaiUpdateRealAccountBody");

export const realAccountIdParamSchema = idParamSchema();
