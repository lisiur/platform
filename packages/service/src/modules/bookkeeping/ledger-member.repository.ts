import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";

export const ledgerMemberRepository = {
  findMembership(
    ledgerId: string,
    userId: string,
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.ledgerMember.findUnique({
      where: { ledgerId_userId: { ledgerId, userId } },
    });
  },

  listByLedger(ledgerId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.ledgerMember.findMany({
      where: { ledgerId },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    });
  },

  /** Earliest-joined member other than the excluded user — the ownership heir. */
  findFirstOtherMember(
    ledgerId: string,
    excludeUserId: string,
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.ledgerMember.findFirst({
      where: { ledgerId, userId: { not: excludeUserId } },
      orderBy: { createdAt: "asc" },
    });
  },

  create(
    data: { ledgerId: string; userId: string; role: string },
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.ledgerMember.create({ data });
  },

  updateRole(
    ledgerId: string,
    userId: string,
    role: string,
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.ledgerMember.update({
      where: { ledgerId_userId: { ledgerId, userId } },
      data: { role },
    });
  },

  delete(
    ledgerId: string,
    userId: string,
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.ledgerMember.delete({
      where: { ledgerId_userId: { ledgerId, userId } },
    });
  },
};
