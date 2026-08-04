import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";

export const systemConfigRepository = {
  findByGroup(group: string) {
    return prisma.systemConfig.findMany({
      where: { group },
      orderBy: { sortOrder: "asc" },
    });
  },

  findAll() {
    return prisma.systemConfig.findMany({
      orderBy: [{ group: "asc" }, { sortOrder: "asc" }],
    });
  },

  findByGroupAndKey(group: string, key: string) {
    return prisma.systemConfig.findUnique({
      where: { group_key: { group, key } },
    });
  },

  upsert(group: string, key: string, data: UpsertInput) {
    return prisma.systemConfig.upsert({
      where: { group_key: { group, key } },
      create: { group, key, ...data },
      update: data,
    });
  },

  batchUpsert(items: BatchItem[]) {
    return prisma.$transaction(
      items.map((item) =>
        prisma.systemConfig.upsert({
          where: { group_key: { group: item.group, key: item.key } },
          create: item,
          update: {
            value: item.value,
            type: item.type,
            schema: item.schema,
            label: item.label,
            description: item.description,
            isSecret: item.isSecret,
            mask: item.mask,
            sortOrder: item.sortOrder,
          },
        }),
      ),
    );
  },

  delete(group: string, key: string) {
    return prisma.systemConfig.delete({
      where: { group_key: { group, key } },
    });
  },
};

interface UpsertInput {
  value: string;
  type?: string;
  schema?: Prisma.InputJsonValue;
  label: string;
  description?: string;
  isSecret?: boolean;
  sortOrder?: number;
  mask?: string | null;
}

interface BatchItem extends UpsertInput {
  group: string;
  key: string;
}
