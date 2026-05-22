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
          update: { value: item.value },
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
  label: string;
  description?: string;
  isSecret?: boolean;
  sortOrder?: number;
}

interface BatchItem extends UpsertInput {
  group: string;
  key: string;
}
