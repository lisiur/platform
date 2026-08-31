import { z } from "@hono/zod-openapi";
import { deleteSuccessSchema, errorSchema } from "#lib/openapi";
import { PROJECT_STATUSES } from "../../project.repository";

export { deleteSuccessSchema, errorSchema };

export const projectMemberSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    projectId: z.string().openapi({ example: "clx1234567890" }),
    userId: z.string().openapi({ example: "clx1234567890" }),
    createdAt: z.date(),
    // Owner-only email visibility, same policy as ledger members.
    user: z
      .object({
        id: z.string(),
        name: z.string().openapi({ example: "Alice" }),
        email: z.string().nullable(),
        avatar: z.string().nullable(),
      })
      .nullable(),
  })
  .openapi("QianlaiProjectMember");

export const projectSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    ledgerId: z.string().openapi({ example: "clx1234567890" }),
    name: z.string().openapi({ example: "Kyoto Trip" }),
    description: z.string().nullable().openapi({ example: null }),
    status: z.enum(["active", "archived"]).openapi({ example: "active" }),
    startDate: z.date().nullable().openapi({ example: null }),
    endDate: z.date().nullable().openapi({ example: null }),
    createdAt: z.date(),
    updatedAt: z.date(),
    members: projectMemberSchema.array(),
    entryCount: z.number().int().openapi({ example: 12 }),
  })
  .openapi("QianlaiProject");

export const listProjectsResponseSchema = z
  .object({
    projects: projectSchema.array(),
  })
  .openapi("QianlaiListProjectsResponse");

export const createProjectBodySchema = z
  .object({
    name: z.string().min(1).max(100).openapi({ example: "Kyoto Trip" }),
    description: z.string().max(500).nullable().optional(),
    startDate: z.coerce.date().nullable().optional(),
    endDate: z.coerce.date().nullable().optional(),
  })
  .openapi("QianlaiCreateProjectBody");

export const updateProjectBodySchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).nullable().optional(),
    startDate: z.coerce.date().nullable().optional(),
    endDate: z.coerce.date().nullable().optional(),
    status: z.enum(PROJECT_STATUSES).optional(),
  })
  .openapi("QianlaiUpdateProjectBody");

export const addProjectMemberBodySchema = z
  .object({
    userId: z.string().min(1).openapi({ example: "clx1234567890" }),
  })
  .openapi("QianlaiAddProjectMemberBody");

export const settlementRowSchema = z
  .object({
    userId: z.string().openapi({ example: "clx1234567890" }),
    name: z.string().openapi({ example: "Alice" }),
    avatar: z.string().nullable().openapi({ example: null }),
    /** Signed amount the member fronted (expenses) or received (income). */
    paid: z.number().openapi({ example: 300 }),
    /** The member's equal share of all project flows. */
    share: z.number().openapi({ example: 250 }),
    /** Positive = is owed; negative = owes the group. */
    balance: z.number().openapi({ example: 50 }),
  })
  .openapi("QianlaiSettlementRow");

export const projectReportResponseSchema = z
  .object({
    project: z.object({
      id: z.string(),
      ledgerId: z.string(),
      name: z.string().openapi({ example: "Kyoto Trip" }),
      status: z.enum(["active", "archived"]),
      startDate: z.date().nullable(),
      endDate: z.date().nullable(),
    }),
    statement: z.object({
      income: z
        .object({
          id: z.string(),
          name: z.string().nullable(),
          code: z.string().nullable(),
          type: z.string(),
          sortOrder: z.number().int(),
          balance: z.number(),
        })
        .array(),
      expense: z
        .object({
          id: z.string(),
          name: z.string().nullable(),
          code: z.string().nullable(),
          type: z.string(),
          sortOrder: z.number().int(),
          balance: z.number(),
        })
        .array(),
      totalIncome: z.number().openapi({ example: 0 }),
      totalExpense: z.number().openapi({ example: 500 }),
      net: z.number().openapi({ example: -500 }),
    }),
    settlement: settlementRowSchema.array(),
    totals: z
      .object({ entries: z.number().int().openapi({ example: 8 }) })
      .openapi("QianlaiProjectReportTotals"),
  })
  .openapi("QianlaiProjectReportResponse");

export const ledgerIdParamSchema = z.object({
  ledgerId: z.string().min(1).openapi({ example: "clx1234567890" }),
});

export const projectIdParamSchema = z.object({
  ledgerId: z.string().min(1).openapi({ example: "clx1234567890" }),
  projectId: z.string().min(1).openapi({ example: "clx1234567890" }),
});

export const projectMemberParamSchema = z.object({
  ledgerId: z.string().min(1).openapi({ example: "clx1234567890" }),
  projectId: z.string().min(1).openapi({ example: "clx1234567890" }),
  userId: z.string().min(1).openapi({ example: "clx1234567890" }),
});
