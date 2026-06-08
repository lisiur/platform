import { HTTPException } from "hono/http-exception";
import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";
import { notificationCache } from "./cache";
import {
  getActiveNotificationChannel,
  redactNotificationChannel,
} from "./channel.service";

const templateWithChannel = {
  channel: true,
} as const;

type NotificationTemplateWithChannel = Prisma.NotificationTemplateGetPayload<{
  include: typeof templateWithChannel;
}>;

function asInputJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return value as Prisma.InputJsonValue;
}

function redactTemplateChannel<
  T extends { channel: { providerKey: string; config: unknown } },
>(template: T) {
  return { ...template, channel: redactNotificationChannel(template.channel) };
}

export async function listNotificationTemplates(params?: {
  channelId?: string;
  includeDeleted?: boolean;
}) {
  const templates = await prisma.notificationTemplate.findMany({
    where: {
      deletedAt: params?.includeDeleted ? undefined : null,
      channelId: params?.channelId,
    },
    include: templateWithChannel,
    orderBy: { createdAt: "desc" },
  });

  return templates.map(redactTemplateChannel);
}

export async function getNotificationTemplate(id: string) {
  const template = await prisma.notificationTemplate.findFirst({
    where: { id, deletedAt: null },
    include: templateWithChannel,
  });

  if (!template) {
    throw new HTTPException(404, {
      message: "Notification template not found",
    });
  }

  return redactTemplateChannel(template);
}

export async function createNotificationTemplate(data: {
  key: string;
  channelId: string;
  name: string;
  description?: string | null;
  enabled?: boolean;
  subjectTemplate?: string | null;
  titleTemplate?: string | null;
  bodyTemplate: string;
  variablesSchema?: unknown;
  sampleVariables?: unknown;
}) {
  const existing = await prisma.notificationTemplate.findUnique({
    where: { key: data.key },
  });
  if (existing) {
    throw new HTTPException(400, {
      message: "Notification template key exists",
    });
  }

  await getActiveNotificationChannel(data.channelId);

  const template = await prisma.notificationTemplate.create({
    data: {
      key: data.key,
      channelId: data.channelId,
      name: data.name,
      description: data.description,
      enabled: data.enabled ?? true,
      subjectTemplate: data.subjectTemplate,
      titleTemplate: data.titleTemplate,
      bodyTemplate: data.bodyTemplate,
      variablesSchema: asInputJson(data.variablesSchema),
      sampleVariables: asInputJson(data.sampleVariables),
    },
    include: templateWithChannel,
  });

  notificationCache.invalidateTemplates();
  return redactTemplateChannel(template);
}

export async function updateNotificationTemplate(
  id: string,
  data: {
    key?: string;
    channelId?: string;
    name?: string;
    description?: string | null;
    enabled?: boolean;
    subjectTemplate?: string | null;
    titleTemplate?: string | null;
    bodyTemplate?: string;
    variablesSchema?: unknown;
    sampleVariables?: unknown;
  },
) {
  const existing = await prisma.notificationTemplate.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    throw new HTTPException(404, {
      message: "Notification template not found",
    });
  }

  if (data.key && data.key !== existing.key) {
    const conflicting = await prisma.notificationTemplate.findUnique({
      where: { key: data.key },
    });
    if (conflicting) {
      throw new HTTPException(400, {
        message: "Notification template key exists",
      });
    }
  }

  if (data.channelId) {
    await getActiveNotificationChannel(data.channelId);
  }

  const template = await prisma.notificationTemplate.update({
    where: { id },
    data: {
      key: data.key,
      channelId: data.channelId,
      name: data.name,
      description: data.description,
      enabled: data.enabled,
      subjectTemplate: data.subjectTemplate,
      titleTemplate: data.titleTemplate,
      bodyTemplate: data.bodyTemplate,
      variablesSchema: asInputJson(data.variablesSchema),
      sampleVariables: asInputJson(data.sampleVariables),
    },
    include: templateWithChannel,
  });

  notificationCache.invalidateTemplates();
  return redactTemplateChannel(template);
}

export async function deleteNotificationTemplate(id: string) {
  const existing = await prisma.notificationTemplate.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    throw new HTTPException(404, {
      message: "Notification template not found",
    });
  }

  await prisma.notificationTemplate.update({
    where: { id },
    data: { deletedAt: new Date(), enabled: false },
  });

  notificationCache.invalidateTemplates();
  return { success: true as const };
}

export async function getEnabledTemplateByKey(key: string) {
  const cached =
    notificationCache.getTemplates<NotificationTemplateWithChannel>(key);
  if (cached) return cached;

  const template = await prisma.notificationTemplate.findFirst({
    where: {
      key,
      enabled: true,
      deletedAt: null,
      channel: {
        enabled: true,
        deletedAt: null,
      },
    },
    include: templateWithChannel,
  });

  if (!template) {
    throw new HTTPException(404, {
      message: "Notification template not found",
    });
  }

  notificationCache.setTemplates(key, template);
  return template;
}
