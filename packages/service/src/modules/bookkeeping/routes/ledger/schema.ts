import { z } from "@hono/zod-openapi";
import { deleteSuccessSchema, errorSchema } from "#lib/openapi";
import { LEDGER_ROLES, LEDGER_STATUSES } from "../../domain";

export { deleteSuccessSchema, errorSchema };

export const ledgerSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    ownerId: z.string().openapi({ example: "clx1234567890" }),
    name: z.string().openapi({ example: "Default Ledger" }),
    description: z.string().nullable().openapi({ example: null }),
    currency: z.string().openapi({ example: "CNY" }),
    status: z.enum(LEDGER_STATUSES),
    isDefault: z.boolean().openapi({ example: true }),
    createdAt: z.date(),
    updatedAt: z.date(),
    myRole: z.enum(LEDGER_ROLES),
    membersCount: z.number().int().openapi({ example: 1 }),
    shared: z.boolean().openapi({ example: false }),
  })
  .openapi("QianlaiLedger");

export const listLedgersResponseSchema = z
  .object({
    ledgers: ledgerSchema.array(),
  })
  .openapi("QianlaiListLedgersResponse");

export const ledgerDetailSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    ownerId: z.string().openapi({ example: "clx1234567890" }),
    name: z.string().openapi({ example: "Travel 2026" }),
    description: z.string().nullable().openapi({ example: null }),
    currency: z.string().openapi({ example: "CNY" }),
    status: z.enum(LEDGER_STATUSES),
    isDefault: z.boolean().openapi({ example: false }),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .openapi("QianlaiLedgerDetail");

export const createLedgerBodySchema = z
  .object({
    name: z.string().min(1).max(100).openapi({ example: "Travel 2026" }),
    description: z.string().max(500).optional(),
    currency: z.string().min(3).max(3).optional().openapi({ example: "CNY" }),
    locale: z.enum(["en", "zh"]).optional().openapi({
      example: "zh",
      description: "Language for the seeded starter chart of accounts",
    }),
    seedStarterAccounts: z.boolean().optional().openapi({
      example: true,
      description: "Seed a starter chart of accounts (default true)",
    }),
  })
  .openapi("QianlaiCreateLedgerBody");

export const updateLedgerBodySchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).nullable().optional(),
    currency: z.string().min(3).max(3).optional(),
    status: z.enum(LEDGER_STATUSES).optional().openapi({
      example: "active",
      description: "Archived ledgers are read-only",
    }),
  })
  .openapi("QianlaiUpdateLedgerBody");

export const ledgerIdParamSchema = z.object({
  ledgerId: z.string().min(1).openapi({ example: "clx1234567890" }),
});
