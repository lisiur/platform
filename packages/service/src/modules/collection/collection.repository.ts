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

  findAllWithEnrichments(ownerId: string) {
    return prisma.collectionItem.findMany({
      where: { ownerId },
      orderBy: { createdAt: "asc" },
      include: { enrichments: { orderBy: { kind: "asc" } } },
    });
  },

  async findExistingSources(ownerId: string, sources: string[]) {
    if (sources.length === 0) return new Set<string>();
    const rows = await prisma.collectionItem.findMany({
      where: { ownerId, source: { in: sources } },
      select: { source: true },
    });
    return new Set(rows.map((r) => r.source));
  },

  createImported(
    data: {
      ownerId: string;
      appId: string;
      type: CollectionItemType;
      source: string;
      url: string | null;
      title: string | null;
      note: string | null;
      tags: string[];
      status: string;
      mastery: number;
      enrichStatus: string;
      createdAt?: Date;
      enrichments: Array<{
        kind: string;
        content: EnrichmentContent;
        model: string;
        generatedAt?: Date;
      }>;
    },
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.collectionItem.create({
      data: {
        ownerId: data.ownerId,
        appId: data.appId,
        type: data.type,
        source: data.source,
        url: data.url,
        title: data.title,
        note: data.note,
        tags: data.tags,
        status: data.status,
        mastery: data.mastery,
        enrichStatus: data.enrichStatus,
        ...(data.createdAt ? { createdAt: data.createdAt } : {}),
        ...(data.enrichments.length > 0
          ? {
              enrichments: {
                create: data.enrichments.map((e) => ({
                  kind: e.kind,
                  content: e.content as Prisma.InputJsonValue,
                  model: e.model,
                  ...(e.generatedAt ? { generatedAt: e.generatedAt } : {}),
                })),
              },
            }
          : {}),
      },
    });
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
      enrichStatus?: string;
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
        ...(data.enrichStatus ? { enrichStatus: data.enrichStatus } : {}),
      },
      include: { _count: { select: { enrichments: true } } },
    });
  },

  markEnrichmentRetryable(id: string) {
    return prisma.collectionItem.updateMany({
      where: { id, enrichStatus: "failed" },
      data: { enrichStatus: "pending", enrichError: null },
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
      enrichStatus?: string;
      enrichError?: string | null;
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
