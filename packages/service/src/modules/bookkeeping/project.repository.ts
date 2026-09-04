import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";

export const PROJECT_STATUSES = ["active", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

const projectMemberInclude = {
  user: { select: { id: true, name: true, email: true, avatar: true, flags: true } },
} as const satisfies Prisma.ProjectMemberInclude;

export const projectRepository = {
  findById(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.project.findUnique({ where: { id } });
  },

  findByIdWithMembers(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.project.findUnique({
      where: { id },
      include: { members: { include: projectMemberInclude } },
    });
  },

  listByLedger(ledgerId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.project.findMany({
      where: { ledgerId },
      include: { members: { include: projectMemberInclude } },
      orderBy: { createdAt: "asc" },
    });
  },

  listByIds(ids: string[], tx: Prisma.TransactionClient = prisma) {
    return tx.project.findMany({
      where: { id: { in: ids } },
      include: { members: { include: projectMemberInclude } },
      orderBy: { createdAt: "asc" },
    });
  },

  create(
    data: {
      ledgerId: string;
      name: string;
      description?: string | null;
      startDate?: Date | null;
      endDate?: Date | null;
    },
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.project.create({
      data,
      include: { members: { include: projectMemberInclude } },
    });
  },

  update(
    id: string,
    data: {
      name?: string;
      description?: string | null;
      startDate?: Date | null;
      endDate?: Date | null;
      status?: ProjectStatus;
    },
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.project.update({
      where: { id },
      data,
      include: { members: { include: projectMemberInclude } },
    });
  },

  delete(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.project.delete({ where: { id } });
  },

  /** Entry count of a project (for list summaries). */
  countEntries(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.journalEntry.count({ where: { projectId: id } });
  },
};
