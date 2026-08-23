import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";

export const shareCodeRepository = {
  findByCode(code: string, tx: Prisma.TransactionClient = prisma) {
    return tx.ledgerShareCode.findUnique({ where: { code } });
  },

  findById(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.ledgerShareCode.findUnique({ where: { id } });
  },

  listByLedger(ledgerId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.ledgerShareCode.findMany({
      where: { ledgerId },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  create(
    data: {
      ledgerId: string;
      code: string;
      role: string;
      expiresAt?: Date | null;
      maxUses?: number | null;
      createdById: string;
    },
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.ledgerShareCode.create({
      data,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
  },

  revoke(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.ledgerShareCode.update({
      where: { id },
      data: { status: "revoked" },
    });
  },

  incrementUses(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.ledgerShareCode.update({
      where: { id },
      data: { usesCount: { increment: 1 } },
    });
  },
};
