import { HTTPException } from "hono/http-exception";
import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";
import { notificationCache } from "./cache";
import {
  getNotificationProvider,
  listNotificationProviders,
  REDACTED_NOTIFICATION_SECRET,
  redactNotificationProviderConfig,
  validateNotificationProviderConfig,
} from "./provider";

function asInputJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return value as Prisma.InputJsonValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function preserveRedactedSecrets(params: {
  providerKey: string;
  nextConfig: unknown;
  existingConfig: unknown;
}) {
  if (!isRecord(params.nextConfig) || !isRecord(params.existingConfig)) {
    return params.nextConfig;
  }

  const provider = getNotificationProvider(params.providerKey);
  const merged = { ...params.nextConfig };

  for (const field of provider.secretFields) {
    if (merged[field] === REDACTED_NOTIFICATION_SECRET) {
      merged[field] = params.existingConfig[field];
    }
  }

  return merged;
}

export function redactNotificationChannel<
  T extends { providerKey: string; config: unknown },
>(channel: T) {
  return {
    ...channel,
    config: redactNotificationProviderConfig(
      channel.providerKey,
      channel.config,
    ),
  };
}

export function listNotificationChannelProviders() {
  return listNotificationProviders();
}

export async function listNotificationChannels(params?: {
  includeDeleted?: boolean;
}) {
  const channels = await prisma.notificationChannel.findMany({
    where: params?.includeDeleted ? undefined : { deletedAt: null },
    orderBy: { createdAt: "desc" },
  });

  return channels.map(redactNotificationChannel);
}

export async function getNotificationChannel(id: string) {
  const channel = await prisma.notificationChannel.findFirst({
    where: { id, deletedAt: null },
  });

  if (!channel) {
    throw new HTTPException(404, { message: "Notification channel not found" });
  }

  return redactNotificationChannel(channel);
}

export async function createNotificationChannel(data: {
  key: string;
  name: string;
  providerKey: string;
  enabled?: boolean;
  config?: unknown;
}) {
  const existing = await prisma.notificationChannel.findUnique({
    where: { key: data.key },
  });
  if (existing) {
    throw new HTTPException(400, {
      message: "Notification channel key exists",
    });
  }

  const config = validateNotificationProviderConfig(
    data.providerKey,
    data.config,
  );

  const channel = await prisma.notificationChannel.create({
    data: {
      key: data.key,
      name: data.name,
      providerKey: data.providerKey,
      enabled: data.enabled ?? true,
      config: asInputJson(config),
    },
  });

  notificationCache.invalidateChannels();
  return redactNotificationChannel(channel);
}

export async function updateNotificationChannel(
  id: string,
  data: {
    key?: string;
    name?: string;
    providerKey?: string;
    enabled?: boolean;
    config?: unknown;
  },
) {
  const existing = await prisma.notificationChannel.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    throw new HTTPException(404, { message: "Notification channel not found" });
  }

  if (data.key && data.key !== existing.key) {
    const conflicting = await prisma.notificationChannel.findUnique({
      where: { key: data.key },
    });
    if (conflicting) {
      throw new HTTPException(400, {
        message: "Notification channel key exists",
      });
    }
  }

  const providerKey = data.providerKey ?? existing.providerKey;

  if (
    data.providerKey &&
    data.providerKey !== existing.providerKey &&
    data.config === undefined
  ) {
    throw new HTTPException(400, {
      message: "Config is required when changing notification provider",
    });
  }

  const config =
    data.config === undefined
      ? existing.config
      : preserveRedactedSecrets({
          providerKey,
          nextConfig: validateNotificationProviderConfig(
            providerKey,
            data.config,
          ),
          existingConfig: existing.config,
        });

  const channel = await prisma.notificationChannel.update({
    where: { id },
    data: {
      key: data.key,
      name: data.name,
      providerKey: data.providerKey,
      enabled: data.enabled,
      config: asInputJson(config),
    },
  });

  notificationCache.invalidateChannels();
  notificationCache.invalidateTemplates();
  return redactNotificationChannel(channel);
}

export async function deleteNotificationChannel(id: string) {
  const existing = await prisma.notificationChannel.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    throw new HTTPException(404, { message: "Notification channel not found" });
  }

  await prisma.notificationChannel.update({
    where: { id },
    data: { deletedAt: new Date(), enabled: false },
  });

  notificationCache.invalidateChannels();
  notificationCache.invalidateTemplates();
  return { success: true as const };
}

export async function getActiveNotificationChannel(id: string) {
  const cacheKey = `channel:${id}`;
  const cached =
    notificationCache.getChannel<
      Awaited<ReturnType<typeof prisma.notificationChannel.findFirst>>
    >(cacheKey);
  if (cached) return cached;

  const channel = await prisma.notificationChannel.findFirst({
    where: { id, deletedAt: null, enabled: true },
  });

  if (!channel) {
    throw new HTTPException(404, { message: "Notification channel not found" });
  }

  notificationCache.setChannel(cacheKey, channel);
  return channel;
}
