import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";

export const redeemCodeRepository = {
  findMany(take?: number, skip?: number) {
    return prisma.redeemCode.findMany({
      take,
      skip,
      orderBy: { createdAt: "desc" },
    });
  },

  count() {
    return prisma.redeemCode.count();
  },

  findById(id: string) {
    return prisma.redeemCode.findUnique({ where: { id } });
  },

  findByCode(code: string) {
    return prisma.redeemCode.findUnique({ where: { code } });
  },

  create(data: { code: string; credit: number; expiresAt?: Date }) {
    return prisma.redeemCode.create({ data });
  },

  update(
    id: string,
    data: {
      credit?: number;
      enabled?: boolean;
      expiresAt?: Date | null;
    },
  ) {
    return prisma.redeemCode.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.redeemCode.delete({ where: { id } });
  },

  markUsed(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    return client.redeemCode.updateMany({
      where: { id, status: "unused" },
      data: { status: "used" },
    });
  },
};
