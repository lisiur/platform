import type { Prisma, UserCredit } from "#generated/prisma/client";
import { prisma } from "#lib/db";

async function lockCredit(
  t: Prisma.TransactionClient,
  userId: string,
): Promise<UserCredit> {
  await t.userCredit.upsert({
    where: { userId },
    update: {},
    create: { userId, balance: 0 },
  });
  const [credit] = await t.$queryRaw<Array<UserCredit>>`
    SELECT * FROM "user_credit" WHERE "userId" = ${userId} FOR UPDATE
  `;
  if (!credit) {
    throw new Error("Credit balance row not found");
  }
  return credit;
}

async function createLedgerEntry(
  t: Prisma.TransactionClient,
  data: LedgerData & {
    balanceBefore: number;
    balanceAfter: number;
    frozenBefore: number;
    frozenAfter: number;
  },
) {
  await t.userCreditLedger.create({
    data: {
      userId: data.userId,
      type: data.type,
      amount: data.amount,
      balanceBefore: data.balanceBefore,
      balanceAfter: data.balanceAfter,
      frozenBefore: data.frozenBefore,
      frozenAfter: data.frozenAfter,
      referenceType: data.referenceType,
      referenceId: data.referenceId,
      description: data.description,
      metadata: data.metadata,
    },
  });
}

type LedgerData = {
  userId: string;
  type: string;
  amount: number;
  referenceType?: string;
  referenceId?: string;
  description?: string;
  metadata?: Prisma.InputJsonValue;
};

export const userCreditRepository = {
  findByUserId(userId: string) {
    return prisma.userCredit.findUnique({ where: { userId } });
  },

  ensure(userId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    return client.userCredit.upsert({
      where: { userId },
      update: {},
      create: { userId, balance: 0 },
    });
  },

  adjustBalance(
    userId: string,
    data: {
      amount: number;
      type: string;
      referenceType?: string;
      referenceId?: string;
      description?: string;
      metadata?: Prisma.InputJsonValue;
      allowNegative?: boolean;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const apply = async (t: Prisma.TransactionClient) => {
      const credit = await lockCredit(t, userId);
      const balanceBefore = credit.balance;
      const balanceAfter = balanceBefore + data.amount;
      if (!data.allowNegative && balanceAfter < 0) {
        throw new Error("Credit balance cannot be negative");
      }
      const updated = await t.userCredit.update({
        where: { userId },
        data: { balance: balanceAfter },
      });
      await createLedgerEntry(t, {
        userId,
        type: data.type,
        amount: data.amount,
        referenceType: data.referenceType,
        referenceId: data.referenceId,
        description: data.description,
        metadata: data.metadata,
        balanceBefore,
        balanceAfter,
        frozenBefore: credit.frozen,
        frozenAfter: credit.frozen,
      });
      return updated;
    };
    return tx ? apply(tx) : prisma.$transaction((t) => apply(t));
  },

  /**
   * Moves `amount` credits from `balance` into `frozen` to reserve them for an
   * in-flight request. When `allowNegative` is false the reservation fails if
   * the balance is insufficient (per-call billing); otherwise the balance may
   * go negative (cost-based billing reserves a fixed amount up front).
   */
  reserveCredits(
    userId: string,
    data: {
      amount: number;
      type: string;
      referenceType?: string;
      referenceId?: string;
      description?: string;
      metadata?: Prisma.InputJsonValue;
      allowNegative?: boolean;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const apply = async (t: Prisma.TransactionClient) => {
      const credit = await lockCredit(t, userId);
      const balanceBefore = credit.balance;
      const frozenBefore = credit.frozen;
      const balanceAfter = balanceBefore - data.amount;
      if (!data.allowNegative && balanceAfter < 0) {
        throw new Error("Credit balance cannot be negative");
      }
      const frozenAfter = frozenBefore + data.amount;
      const updated = await t.userCredit.update({
        where: { userId },
        data: { balance: balanceAfter, frozen: frozenAfter },
      });
      await createLedgerEntry(t, {
        userId,
        type: data.type,
        amount: -data.amount,
        referenceType: data.referenceType,
        referenceId: data.referenceId,
        description: data.description,
        metadata: data.metadata,
        balanceBefore,
        balanceAfter,
        frozenBefore,
        frozenAfter,
      });
      return updated;
    };
    return tx ? apply(tx) : prisma.$transaction((t) => apply(t));
  },

  /**
   * Releases up to `reservedAmount` from `frozen` and reconciles it against
   * the final `chargeAmount`, writing the cost and the refund as separate
   * ledger entries. The cost entry (type `data.type`, amount `-chargeAmount`) is
   * consumed from the reservation in `frozen` first, with any shortfall
   * charged to the balance; the excess (type `refundType ?? data.type`,
   * amount `+excess`) is returned to the balance. Zero-amount entries are
   * skipped, so a full release (`chargeAmount` of 0) writes only the refund
   * entry and a full charge writes only the cost entry.
   */
  settleCredits(
    userId: string,
    data: {
      reservedAmount: number;
      chargeAmount: number;
      type: string;
      refundType?: string;
      referenceType?: string;
      referenceId?: string;
      description?: string;
      refundDescription?: string;
      metadata?: Prisma.InputJsonValue;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const apply = async (t: Prisma.TransactionClient) => {
      const credit = await lockCredit(t, userId);
      const balanceBefore = credit.balance;
      const frozenBefore = credit.frozen;
      const frozenAfter = Math.max(0, frozenBefore - data.reservedAmount);
      const frozenReleased = frozenBefore - frozenAfter;
      const costFromFrozen = Math.min(data.chargeAmount, frozenReleased);
      const refundAmount = Math.max(0, frozenReleased - data.chargeAmount);
      const shortfall = Math.max(0, data.chargeAmount - frozenReleased);
      const balanceAfter = balanceBefore + frozenReleased - data.chargeAmount;
      const updated = await t.userCredit.update({
        where: { userId },
        data: { balance: balanceAfter, frozen: frozenAfter },
      });
      const costBalanceAfter = balanceBefore - shortfall;
      const costFrozenAfter = frozenBefore - costFromFrozen;
      if (data.chargeAmount > 0) {
        await createLedgerEntry(t, {
          userId,
          type: data.type,
          amount: -data.chargeAmount,
          referenceType: data.referenceType,
          referenceId: data.referenceId,
          description: data.description,
          metadata: data.metadata,
          balanceBefore,
          balanceAfter: costBalanceAfter,
          frozenBefore,
          frozenAfter: costFrozenAfter,
        });
      }
      if (refundAmount > 0) {
        await createLedgerEntry(t, {
          userId,
          type: data.refundType ?? data.type,
          amount: refundAmount,
          referenceType: data.referenceType,
          referenceId: data.referenceId,
          description: data.refundDescription ?? data.description,
          metadata: data.metadata,
          balanceBefore: costBalanceAfter,
          balanceAfter,
          frozenBefore: costFrozenAfter,
          frozenAfter,
        });
      }
      return updated;
    };
    return tx ? apply(tx) : prisma.$transaction((t) => apply(t));
  },

  findLedgerByUserId(
    userId: string,
    limit?: number,
    offset?: number,
    types?: string[],
  ) {
    return prisma.userCreditLedger.findMany({
      where: {
        userId,
        ...(types ? { type: { in: types } } : {}),
      },
      take: limit,
      skip: offset,
      orderBy: { createdAt: "desc" },
    });
  },

  countLedgerByUserId(userId: string, types?: string[]) {
    return prisma.userCreditLedger.count({
      where: {
        userId,
        ...(types ? { type: { in: types } } : {}),
      },
    });
  },

  findManyWithUser(limit?: number, offset?: number) {
    return prisma.userCredit.findMany({
      include: { user: { select: { id: true, name: true, email: true } } },
      take: limit,
      skip: offset,
      orderBy: { updatedAt: "desc" },
    });
  },

  count() {
    return prisma.userCredit.count();
  },
};
