import { prisma } from "#lib/db";

export const rateLimitRepository = {
  findAll() {
    return prisma.rateLimitOverride.findMany({
      orderBy: { createdAt: "desc" },
    });
  },

  findBySubject(subject: string) {
    return prisma.rateLimitOverride.findUnique({ where: { subject } });
  },

  upsert(subject: string, data: UpsertInput) {
    return prisma.rateLimitOverride.upsert({
      where: { subject },
      create: { subject, ...data },
      update: data,
    });
  },

  delete(subject: string) {
    return prisma.rateLimitOverride.delete({ where: { subject } });
  },
};

interface UpsertInput {
  type: string;
  max?: number | null;
  windowMs?: number | null;
  bypass?: boolean;
  note?: string | null;
  startAt?: Date | null;
  endAt?: Date | null;
}
