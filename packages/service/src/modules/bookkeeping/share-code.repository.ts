import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";

const shareCodeInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
  project: { select: { id: true, name: true, status: true } },
} as const satisfies Prisma.LedgerShareCodeInclude;

export const shareCodeRepository = {
  findByCode(code: string, tx: Prisma.TransactionClient = prisma) {
    return tx.ledgerShareCode.findUnique({ where: { code } });
  },

  findById(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.ledgerShareCode.findUnique({ where: { id } });
  },

  listByLedger(
    ledgerId: string,
    opts: { projectId?: string } = {},
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.ledgerShareCode.findMany({
      where: {
        ledgerId,
        ...(opts.projectId === null
          ? { projectId: null }
          : opts.projectId
            ? { projectId: opts.projectId }
            : {}),
      },
      include: shareCodeInclude,
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
      projectId?: string | null;
    },
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.ledgerShareCode.create({
      data,
      include: shareCodeInclude,
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
