import { prisma } from "#lib/db";

export async function listUserNotifications(params: {
  userId: string;
  appId: string;
  limit: number;
  offset: number;
  unreadOnly?: boolean;
}) {
  const where = {
    recipientUserId: params.userId,
    appId: params.appId,
    channel: { providerKey: "in-app" },
    archivedAt: null,
    ...(params.unreadOnly ? { readAt: null } : {}),
  };

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: params.limit,
      skip: params.offset,
      select: {
        id: true,
        renderedTitle: true,
        renderedBody: true,
        readAt: true,
        createdAt: true,
      },
    }),
    prisma.notification.count({ where }),
  ]);

  return { notifications, total };
}

export async function getUserUnreadCount(userId: string, appId: string) {
  return prisma.notification.count({
    where: {
      recipientUserId: userId,
      appId,
      channel: { providerKey: "in-app" },
      archivedAt: null,
      readAt: null,
    },
  });
}

export async function markNotificationRead(id: string, userId: string) {
  return prisma.notification.updateMany({
    where: { id, recipientUserId: userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(userId: string, appId: string) {
  return prisma.notification.updateMany({
    where: {
      recipientUserId: userId,
      appId,
      channel: { providerKey: "in-app" },
      archivedAt: null,
      readAt: null,
    },
    data: { readAt: new Date() },
  });
}
