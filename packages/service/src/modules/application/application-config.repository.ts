import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";

export const applicationConfigRepository = {
  findByAppAndGroup(appId: string, group: string) {
    return prisma.applicationConfig.findMany({
      where: { appId, group },
      orderBy: { sortOrder: "asc" },
    });
  },

  findAllByApp(appId: string) {
    return prisma.applicationConfig.findMany({
      where: { appId },
      orderBy: [{ group: "asc" }, { sortOrder: "asc" }],
    });
  },

  findByAppGroupAndKey(appId: string, group: string, key: string) {
    return prisma.applicationConfig.findUnique({
      where: { appId_group_key: { appId, group, key } },
    });
  },

  upsert(appId: string, group: string, key: string, data: UpsertInput) {
    return prisma.applicationConfig.upsert({
      where: { appId_group_key: { appId, group, key } },
      create: { appId, group, key, ...data },
      update: data,
    });
  },

  batchUpsert(items: BatchItem[]) {
    return prisma.$transaction(
      items.map((item) =>
        prisma.applicationConfig.upsert({
          where: {
            appId_group_key: {
              appId: item.appId,
              group: item.group,
              key: item.key,
            },
          },
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

  delete(appId: string, group: string, key: string) {
    return prisma.applicationConfig.delete({
      where: { appId_group_key: { appId, group, key } },
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
  appId: string;
  group: string;
  key: string;
}
