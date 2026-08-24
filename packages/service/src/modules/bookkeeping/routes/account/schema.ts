import { z } from "@hono/zod-openapi";
import type { BookAccount } from "#generated/prisma/client";
import { deleteSuccessSchema, errorSchema } from "#lib/openapi";
import { ACCOUNT_TYPES } from "../../domain";

export { deleteSuccessSchema, errorSchema };

export const accountTypeEnumSchema = z.enum(ACCOUNT_TYPES);

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
    name: z.string().openapi({ example: "Cash" }),
    type: accountTypeEnumSchema,
    sortOrder: z.number().int().openapi({ example: 10 }),
    parentId: z.string().nullable().openapi({ example: null }),
    status: z.enum(["active", "archived"]).openapi({ example: "active" }),
    icon: z.string().nullable().openapi({ example: "💳" }),
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
    type: accountTypeEnumSchema,
    sortOrder: z.number().int().optional().openapi({ example: 150 }),
    parentId: z.string().nullable().optional().openapi({ example: null }),
    icon: z.string().max(100).nullable().optional().openapi({ example: "💳" }),
    meta: accountMetaSchema.nullable().optional(),
  })
  .openapi("QianlaiCreateAccountBody");

export const updateAccountBodySchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    parentId: z.string().nullable().optional(),
    sortOrder: z.number().int().optional(),
    status: z.enum(["active", "archived"]).optional(),
    icon: z.string().max(100).nullable().optional(),
    meta: accountMetaSchema.nullable().optional(),
  })
  .openapi("QianlaiUpdateAccountBody");

export const ledgerIdParamSchema = z.object({
  ledgerId: z.string().min(1).openapi({ example: "clx1234567890" }),
});

export const accountIdParamSchema = z.object({
  ledgerId: z.string().min(1).openapi({ example: "clx1234567890" }),
  id: z.string().min(1).openapi({ example: "clx1234567890" }),
});
