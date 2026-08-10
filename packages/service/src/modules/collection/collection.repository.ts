import type {
  CollectionItemType,
  ItemEnrichment,
  Prisma,
} from "#generated/prisma/client";
import { prisma } from "#lib/db";

export type CollectionItemWithEnrichments = Awaited<
  ReturnType<typeof collectionRepository.findOwnedById>
>;

export type EnrichmentContent = Record<string, unknown>;

export const collectionRepository = {
  findMany(params: {
    ownerId: string;
    where?: Prisma.CollectionItemWhereInput;
    limit?: number;
    offset?: number;
  }) {
    const { ownerId, where, limit = 50, offset = 0 } = params;
    return prisma.collectionItem.findMany({
      where: { ownerId, ...where },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: { _count: { select: { enrichments: true } } },
    });
  },

  count(params: { ownerId: string; where?: Prisma.CollectionItemWhereInput }) {
    const { ownerId, where } = params;
    return prisma.collectionItem.count({ where: { ownerId, ...where } });
  },

  findOwnedById(ownerId: string, id: string) {
    return prisma.collectionItem.findFirst({
      where: { id, ownerId },
      include: { enrichments: { orderBy: { kind: "asc" } } },
    });
  },

  findOwnedByIdLean(ownerId: string, id: string) {
    return prisma.collectionItem.findFirst({
      where: { id, ownerId },
      select: { id: true, ownerId: true, type: true, source: true },
    });
  },

  create(
    data: {
      ownerId: string;
      appId: string;
      type: CollectionItemType;
      source: string;
      url?: string | null;
      title?: string | null;
      note?: string | null;
      tags?: string[];
    },
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.collectionItem.create({
      data: {
        ownerId: data.ownerId,
        appId: data.appId,
        type: data.type,
        source: data.source,
        url: data.url ?? null,
        title: data.title ?? null,
        note: data.note ?? null,
        tags: data.tags ?? [],
      },
      include: { _count: { select: { enrichments: true } } },
    });
  },

  update(
    id: string,
    data: {
      title?: string | null;
      note?: string | null;
      tags?: string[];
      status?: string;
      mastery?: number;
      url?: string | null;
    },
  ) {
    return prisma.collectionItem.update({
      where: { id },
      data,
      include: { _count: { select: { enrichments: true } } },
    });
  },

  delete(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.collectionItem.delete({ where: { id } });
  },

  upsertEnrichment(
    data: {
      itemId: string;
      kind: string;
      content: EnrichmentContent;
      model: string;
    },
    tx: Prisma.TransactionClient = prisma,
  ): Promise<ItemEnrichment> {
    return tx.itemEnrichment.upsert({
      where: { itemId_kind: { itemId: data.itemId, kind: data.kind } },
      create: {
        itemId: data.itemId,
        kind: data.kind,
        content: data.content as Prisma.InputJsonValue,
        model: data.model,
      },
      update: {
        content: data.content as Prisma.InputJsonValue,
        model: data.model,
        generatedAt: new Date(),
      },
    });
  },

  listEnrichments(itemId: string) {
    return prisma.itemEnrichment.findMany({
      where: { itemId },
      orderBy: { kind: "asc" },
    });
  },
};
