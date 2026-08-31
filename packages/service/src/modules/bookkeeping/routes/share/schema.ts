import { z } from "@hono/zod-openapi";
import { deleteSuccessSchema, errorSchema } from "#lib/openapi";
import { LEDGER_ROLES } from "../../domain";

export { deleteSuccessSchema, errorSchema };

export const ledgerMemberSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    ledgerId: z.string().openapi({ example: "clx1234567890" }),
    userId: z.string().openapi({ example: "clx1234567890" }),
    role: z.enum(LEDGER_ROLES).openapi({ example: "editor" }),
    createdAt: z.date(),
    user: z
      .object({
        id: z.string(),
        name: z.string().openapi({ example: "Alice" }),
        email: z.string().nullable(),
        avatar: z.string().nullable(),
      })
      .nullable(),
  })
  .openapi("QianlaiLedgerMember");

export const listMembersResponseSchema = z
  .object({
    members: ledgerMemberSchema.array(),
  })
  .openapi("QianlaiListMembersResponse");

export const shareCodeSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    ledgerId: z.string().openapi({ example: "clx1234567890" }),
    code: z.string().openapi({ example: "A2B4C6D8E9F2" }),
    role: z.enum(["editor", "viewer", "guest"]).openapi({ example: "editor" }),
    status: z.enum(["active", "revoked"]).openapi({ example: "active" }),
    // Set = project-scoped invite (grants guest access to this project).
    projectId: z.string().nullable().openapi({ example: null }),
    project: z
      .object({
        id: z.string(),
        name: z.string().openapi({ example: "Kyoto Trip" }),
        status: z.string().openapi({ example: "active" }),
      })
      .nullable(),
    expiresAt: z.date().nullable().openapi({ example: null }),
    maxUses: z.number().int().nullable().openapi({ example: null }),
    usesCount: z.number().int().openapi({ example: 0 }),
    createdBy: z
      .object({
        id: z.string(),
        name: z.string().openapi({ example: "Alice" }),
        email: z.string().nullable(),
      })
      .nullable(),
    createdAt: z.date(),
  })
  .openapi("QianlaiShareCode");

export const listShareCodesResponseSchema = z
  .object({
    codes: shareCodeSchema.array(),
  })
  .openapi("QianlaiListShareCodesResponse");

export const createShareCodeBodySchema = z
  .object({
    role: z.enum(["editor", "viewer", "guest"]).openapi({ example: "editor" }),
    expiresAt: z.coerce.date().nullable().optional().openapi({ example: null }),
    maxUses: z
      .number()
      .int()
      .min(1)
      .nullable()
      .optional()
      .openapi({ example: null }),
    // When set the code becomes a project invite: `role` must be "guest"
    // (the guest role is implied, not chosen).
    projectId: z
      .string()
      .min(1)
      .nullable()
      .optional()
      .openapi({ example: null }),
  })
  .refine((data) => data.role !== "guest" || !!data.projectId, {
    message: "Share code role must be editor or viewer for ledger-wide codes",
    path: ["role"],
  })
  .openapi("QianlaiCreateShareCodeBody");

export const redeemBodySchema = z
  .object({
    code: z.string().min(1).max(32).openapi({ example: "A2B4C6D8E9F2" }),
  })
  .openapi("QianlaiRedeemBody");

export const redeemResponseSchema = z
  .object({
    ledgerId: z.string().openapi({ example: "clx1234567890" }),
    role: z.enum(["editor", "viewer", "guest"]).openapi({ example: "editor" }),
    // Present when the code was a project invite.
    projectId: z.string().nullable().optional().openapi({ example: null }),
  })
  .openapi("QianlaiRedeemResponse");

export const transferBodySchema = z
  .object({
    userId: z.string().min(1).openapi({ example: "clx1234567890" }),
  })
  .openapi("QianlaiTransferBody");

export const updateMemberRoleBodySchema = z
  .object({
    role: z.enum(["editor", "viewer"]).openapi({ example: "editor" }),
  })
  .openapi("QianlaiUpdateMemberRoleBody");

export const ledgerIdParamSchema = z.object({
  ledgerId: z.string().min(1).openapi({ example: "clx1234567890" }),
});

export const listShareCodesQuerySchema = z
  .object({
    // Filter to codes of one project. Use the literal string "null" to
    // request only ledger-wide codes (projectId is null).
    projectId: z.string().min(1).optional().openapi({ example: null }),
  })
  .openapi("QianlaiListShareCodesQuery");

export const memberParamSchema = z.object({
  ledgerId: z.string().min(1).openapi({ example: "clx1234567890" }),
  userId: z.string().min(1).openapi({ example: "clx1234567890" }),
});

export const shareCodeParamSchema = z.object({
  ledgerId: z.string().min(1).openapi({ example: "clx1234567890" }),
  id: z.string().min(1).openapi({ example: "clx1234567890" }),
});
