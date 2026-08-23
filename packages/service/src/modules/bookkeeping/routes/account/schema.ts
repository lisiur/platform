import { z } from "@hono/zod-openapi";
import { deleteSuccessSchema, errorSchema } from "#lib/openapi";
import { ACCOUNT_TYPES } from "../../domain";

export { deleteSuccessSchema, errorSchema };

export const accountTypeEnumSchema = z.enum(ACCOUNT_TYPES);

export const bookAccountSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    ledgerId: z.string().openapi({ example: "clx1234567890" }),
    code: z.string().openapi({ example: "1001" }),
    name: z.string().openapi({ example: "Cash" }),
    type: accountTypeEnumSchema,
    parentId: z.string().nullable().openapi({ example: null }),
    status: z.enum(["active", "archived"]).openapi({ example: "active" }),
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
    code: z.string().min(1).max(32).openapi({ example: "1005" }),
    name: z.string().min(1).max(100).openapi({ example: "USD Cash" }),
    type: accountTypeEnumSchema,
    parentId: z.string().nullable().optional().openapi({ example: null }),
  })
  .openapi("QianlaiCreateAccountBody");

export const updateAccountBodySchema = z
  .object({
    code: z.string().min(1).max(32).optional(),
    name: z.string().min(1).max(100).optional(),
    parentId: z.string().nullable().optional(),
    status: z.enum(["active", "archived"]).optional(),
  })
  .openapi("QianlaiUpdateAccountBody");

export const ledgerIdParamSchema = z.object({
  ledgerId: z.string().min(1).openapi({ example: "clx1234567890" }),
});

export const accountIdParamSchema = z.object({
  ledgerId: z.string().min(1).openapi({ example: "clx1234567890" }),
  id: z.string().min(1).openapi({ example: "clx1234567890" }),
});
