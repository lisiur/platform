import { z } from "@hono/zod-openapi";

export { errorSchema, successSchema } from "#lib/openapi";

export const redeemCodeSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    code: z.string().openapi({ example: "WELCOME2024" }),
    credit: z.number().int().openapi({ example: 100 }),
    status: z.string().openapi({ example: "unused" }),
    expiresAt: z.date().nullable().openapi({ example: null }),
    enabled: z.boolean().openapi({ example: true }),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .openapi("RedeemCode");

export const listRedeemCodesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const listMyCreditLedgerQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  type: z.enum(["ai_usage", "redeem", "seed"]).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const listRedeemCodesResponseSchema = z
  .object({
    codes: redeemCodeSchema.array(),
    total: z.number(),
  })
  .openapi("ListRedeemCodesResponse");

export const createRedeemCodeBodySchema = z.object({
  credit: z.number().int().min(1),
  expiresAt: z.string().datetime().optional(),
});

export const updateRedeemCodeBodySchema = z.object({
  credit: z.number().int().min(1).optional(),
  enabled: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export const redeemCodeIdParamSchema = z.object({
  id: z.string().min(1),
});

export const userCreditUserIdParamSchema = z.object({
  userId: z.string().min(1),
});

export const redeemCodeBodySchema = z.object({
  code: z.string().min(1),
});

export const redeemResponseSchema = z
  .object({
    credit: z.number().int(),
    balance: z.number().int(),
  })
  .openapi("RedeemResponse");

export const userCreditSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    balance: z.number().int(),
    frozen: z.number().int(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .openapi("UserCredit");

export const userCreditWithUserSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    balance: z.number().int(),
    frozen: z.number().int(),
    createdAt: z.date(),
    updatedAt: z.date(),
    user: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
    }),
  })
  .openapi("UserCreditWithUser");

export const listUserCreditsResponseSchema = z
  .object({
    credits: userCreditWithUserSchema.array(),
    total: z.number(),
  })
  .openapi("ListUserCreditsResponse");

export const userCreditLedgerSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    type: z.string(),
    amount: z.number().int(),
    balanceBefore: z.number().int(),
    balanceAfter: z.number().int(),
    frozenBefore: z.number().int(),
    frozenAfter: z.number().int(),
    referenceType: z.string().nullable(),
    referenceId: z.string().nullable(),
    description: z.string().nullable(),
    metadata: z.unknown().nullable(),
    createdAt: z.date(),
  })
  .openapi("UserCreditLedger");

export const listUserCreditLedgerResponseSchema = z
  .object({
    entries: userCreditLedgerSchema.array(),
    total: z.number(),
  })
  .openapi("ListUserCreditLedgerResponse");
