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
        // Virtual members (added directly by an editor, never registered)
        // carry this so clients can badge them; absent = a real account.
        isVirtual: z.boolean().optional(),
      })
      .nullable(),
  })
  .openapi("QianlaiLedgerMember");

export const listMembersResponseSchema = z
  .object({
    members: ledgerMemberSchema.array(),
  })
  .openapi("QianlaiListMembersResponse");

/**
 * A minted invite: `code` is a short-lived signed JWT (nothing is stored
 * server-side), `expiresAt` is when it stops working.
 */
export const shareCodeSchema = z
  .object({
    ledgerId: z.string().openapi({ example: "clx1234567890" }),
    code: z.string().openapi({ example: "eyJhbGciOiJIUzI1NiJ9…" }),
    role: z.enum(["editor", "viewer", "guest"]).openapi({ example: "editor" }),
    // Set = project-scoped invite (grants guest access to this project).
    projectId: z.string().nullable().openapi({ example: null }),
    expiresAt: z.date().openapi({ example: new Date(0) }),
    createdAt: z.date(),
  })
  .openapi("QianlaiShareCode");

export const createShareCodeBodySchema = z
  .object({
    role: z.enum(["editor", "viewer", "guest"]).openapi({ example: "editor" }),
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
    code: z
      .string()
      .min(1)
      .max(1024)
      .openapi({ example: "eyJhbGciOiJIUzI1NiJ9…" }),
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

export const updateMemberBodySchema = z
  .object({
    role: z
      .enum(["editor", "viewer"])
      .optional()
      .openapi({ example: "editor" }),
    // Renaming is only allowed for virtual members — real users own their
    // account names.
    name: z
      .string()
      .trim()
      .min(1)
      .max(50)
      .optional()
      .openapi({ example: "小明" }),
  })
  .refine((data) => data.role !== undefined || data.name !== undefined, {
    message: "Provide a role or a name to update",
  })
  // The two fields target disjoint member kinds (role: real members, name:
  // virtual ones), so a body carrying both could never apply.
  .refine((data) => data.role === undefined || data.name === undefined, {
    message: "Provide a role or a name to update, not both",
  })
  .openapi("QianlaiUpdateMemberBody");

export const createVirtualMemberBodySchema = z
  .object({
    name: z.string().trim().min(1).max(50).openapi({ example: "小明" }),
  })
  .openapi("QianlaiCreateVirtualMemberBody");

export const ledgerIdParamSchema = z.object({
  ledgerId: z.string().min(1).openapi({ example: "clx1234567890" }),
});

export const memberParamSchema = z.object({
  ledgerId: z.string().min(1).openapi({ example: "clx1234567890" }),
  userId: z.string().min(1).openapi({ example: "clx1234567890" }),
});
