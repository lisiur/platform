import { HTTPException } from "hono/http-exception";
import type { NotificationStatus, Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";

const notificationRecordRelations = {
  recipient: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  template: {
    select: {
      id: true,
      key: true,
      name: true,
    },
  },
  channel: {
    select: {
      id: true,
      key: true,
      name: true,
      providerKey: true,
    },
  },
  app: {
    select: {
      code: true,
      name: true,
    },
  },
} as const;

const notificationRecordListSelect = {
  id: true,
  renderedSubject: true,
  renderedTitle: true,
  status: true,
  app: notificationRecordRelations.app,
  readAt: true,
  archivedAt: true,
  createdAt: true,
  recipient: notificationRecordRelations.recipient,
  template: notificationRecordRelations.template,
  channel: notificationRecordRelations.channel,
} as const;

export async function listNotificationRecords(params: {
  limit?: number;
  offset?: number;
  recipientUserId?: string;
  recipientEmail?: string;
  recipientName?: string;
  templateId?: string;
  templateKey?: string;
  channelId?: string;
  providerKey?: string;
  status?: NotificationStatus;
  readState?: "all" | "read" | "unread";
  archivedState?: "all" | "active" | "archived";
  source?: string;
  correlationId?: string;
  startDate?: Date;
  endDate?: Date;
}) {
  const {
    limit = 10,
    offset = 0,
    recipientUserId,
    recipientEmail,
    recipientName,
    templateId,
    templateKey,
    channelId,
    providerKey,
    status,
    readState = "all",
    archivedState = "active",
    source,
    correlationId,
    startDate,
    endDate,
  } = params;

  const where: Prisma.NotificationWhereInput = {};

  if (recipientUserId) where.recipientUserId = recipientUserId;
  if (recipientEmail || recipientName) {
    where.recipient = {
      ...(recipientEmail
        ? { email: { contains: recipientEmail, mode: "insensitive" } }
        : {}),
      ...(recipientName
        ? { name: { contains: recipientName, mode: "insensitive" } }
        : {}),
    };
  }
  if (templateId) where.templateId = templateId;
  if (templateKey) where.template = { key: templateKey };
  if (channelId) where.channelId = channelId;
  if (providerKey) where.channel = { providerKey };
  if (status) where.status = status;
  if (readState === "read") where.readAt = { not: null };
  if (readState === "unread") where.readAt = null;
  if (archivedState === "active") where.archivedAt = null;
  if (archivedState === "archived") where.archivedAt = { not: null };
  if (source) where.source = { contains: source, mode: "insensitive" };
  if (correlationId) {
    where.correlationId = { contains: correlationId, mode: "insensitive" };
  }
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) (where.createdAt as Prisma.DateTimeFilter).gte = startDate;
    if (endDate) (where.createdAt as Prisma.DateTimeFilter).lte = endDate;
  }

  const [records, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      select: notificationRecordListSelect,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.notification.count({ where }),
  ]);

  return { records, total };
}

export async function getNotificationRecordById(id: string) {
  const record = await prisma.notification.findUnique({
    where: { id },
    include: notificationRecordRelations,
  });

  if (!record) {
    throw new HTTPException(404, {
      message: "Notification record not found",
    });
  }

  return record;
}
