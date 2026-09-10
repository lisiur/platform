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
        // `flags` is needed so the serializer can derive `isVirtual` —
        // members.manager rows mirror the ledger roster, including the
        // virtual members added directly by the ledger's editors.
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            flags: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  },

  /**
   * Projects of `userId` within a ledger — the guest's visibility scope.
   */
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

  /**
   * Bare userIds of a project's members — the participant-roster extension
   * that lets project outsiders (no LedgerMember row) be tagged or pay.
   * Rows, not bare strings: callers merge them into the roster shape.
   */
  listUserIdsByProject(
    projectId: string,
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.projectMember.findMany({
      where: { projectId },
      select: { userId: true },
    });
  },

  /**
   * Distinct project-participant users inside a ledger — the name/avatar
   * fallback for outsider rows the ledger roster doesn't know.
   */
  listUsersInLedger(ledgerId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.projectMember.findMany({
      where: { project: { ledgerId } },
      select: {
        userId: true,
        user: { select: { name: true, avatar: true } },
      },
      distinct: ["userId"],
    });
  },

  /**
   * UserIds sharing at least one project with `userId` inside the ledger —
   * the co-member roster a guest is allowed to see (participants picker,
   * member list). Includes `userId` themself.
   */
  listSharedMemberUserIds(
    ledgerId: string,
    userId: string,
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.projectMember.findMany({
      where: {
        project: { ledgerId, members: { some: { userId } } },
      },
      select: { userId: true },
      distinct: ["userId"],
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
};
