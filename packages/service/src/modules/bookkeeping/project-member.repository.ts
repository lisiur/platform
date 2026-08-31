import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";

export const projectMemberRepository = {
  findMembership(
    projectId: string,
    userId: string,
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
  },

  listByProject(projectId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.projectMember.findMany({
      where: { projectId },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  },

  /** Projects of `userId` within a ledger — the guest's visibility scope. */
  listProjectIdsForUser(
    ledgerId: string,
    userId: string,
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.projectMember.findMany({
      where: { userId, project: { ledgerId } },
      select: { projectId: true },
    });
  },

  create(
    data: { projectId: string; userId: string },
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.projectMember.create({ data });
  },

  delete(
    projectId: string,
    userId: string,
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.projectMember.delete({
      where: { projectId_userId: { projectId, userId } },
    });
  },

  /** Drops every project membership a user holds inside a ledger (their
   * ledger membership just ended — project access ends with it). */
  deleteAllInLedger(
    ledgerId: string,
    userId: string,
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.projectMember.deleteMany({
      where: { userId, project: { ledgerId } },
    });
  },

  countForUser(
    ledgerId: string,
    userId: string,
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.projectMember.count({
      where: { userId, project: { ledgerId } },
    });
  },
};
