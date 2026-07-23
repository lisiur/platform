import { randomUUID } from "node:crypto";
import { HTTPException } from "hono/http-exception";
import { NotificationStatus, type Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";
import { jobInstanceRepository } from "#repositories/job-instance.repository";
import { eventBus, jobExecutor } from "#states";
import { findTemplateForDelivery } from "./template.service";
import { renderTemplate, validateTemplateVariables } from "./template-renderer";

type NotificationVariables = Record<string, unknown>;

function asInputJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return value as Prisma.InputJsonValue;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

export async function createNotificationsFromTemplate(params: {
  templateKey: string;
  recipientUserIds: string[];
  appId?: string | null;
  variables?: NotificationVariables;
  creatorId?: string | null;
  source?: string | null;
  metadata?: unknown;
}) {
  const recipientUserIds = uniqueStrings(params.recipientUserIds);
  if (recipientUserIds.length === 0) {
    throw new HTTPException(400, {
      message: "Notification recipients required",
    });
  }

  const resolved = await findTemplateForDelivery(params.templateKey);
  if (!resolved) {
    throw new HTTPException(404, {
      message: `Notification template not found for key '${params.templateKey}'`,
    });
  }
  const { template, disabledReason } = resolved;

  const users = await prisma.user.findMany({
    where: { id: { in: recipientUserIds } },
    select: { id: true },
  });
  const existingUserIds = new Set(users.map((user) => user.id));
  const missingUserIds = recipientUserIds.filter(
    (id) => !existingUserIds.has(id),
  );
  if (missingUserIds.length > 0) {
    throw new HTTPException(400, {
      message: `Notification recipients not found: ${missingUserIds.join(", ")}`,
    });
  }

  const correlationId = randomUUID();
  const now = new Date();
  const variables = params.variables ?? {};

  const baseData = {
    correlationId,
    templateId: template.id,
    channelId: template.channelId,
    appId: params.appId,
    creatorId: params.creatorId,
    source: params.source,
    variables: asInputJson(variables),
    metadata: asInputJson(params.metadata),
  };

  // Disabled template/channel: record the attempt as a failed row, skip delivery.
  if (disabledReason) {
    const notificationIds = await prisma.$transaction(async (tx) => {
      const created: string[] = [];
      for (const recipientUserId of recipientUserIds) {
        const notification = await tx.notification.create({
          data: {
            ...baseData,
            recipientUserId,
            renderedSubject: null,
            renderedTitle: null,
            renderedBody: "",
            status: NotificationStatus.FAILED,
            failedAt: now,
            errorMessage: disabledReason,
          },
          select: { id: true },
        });
        created.push(notification.id);
      }
      return created;
    });

    return {
      correlationId,
      total: notificationIds.length,
      pending: 0,
      failed: notificationIds.length,
      notificationIds,
    };
  }

  // Enabled: validate variables, render, create pending rows + delivery job atomically.
  validateTemplateVariables(template.variablesSchema, variables);

  const renderedSubject = renderTemplate(template.subjectTemplate, variables);
  const renderedTitle = renderTemplate(template.titleTemplate, variables);
  const renderedBody = renderTemplate(template.bodyTemplate, variables) ?? "";

  const { notificationIds, job } = await prisma.$transaction(async (tx) => {
    const created: string[] = [];
    for (const recipientUserId of recipientUserIds) {
      const notification = await tx.notification.create({
        data: {
          ...baseData,
          recipientUserId,
          renderedSubject,
          renderedTitle,
          renderedBody,
          status: NotificationStatus.PENDING,
        },
        select: { id: true },
      });
      created.push(notification.id);
    }

    const createdJob = await jobInstanceRepository.create(
      {
        type: "send-notification",
        description: `Deliver ${created.length} notification(s) for template '${params.templateKey}'`,
        payload: { notificationIds: created },
      },
      tx,
    );

    return { notificationIds: created, job: createdJob };
  });

  jobExecutor.enqueue(job);

  return {
    correlationId,
    total: notificationIds.length,
    pending: notificationIds.length,
    failed: 0,
    notificationIds,
  };
}

export async function deliverNotifications(notificationIds: string[]) {
  if (notificationIds.length === 0) return { delivered: 0, skipped: 0 };

  const notifications = await prisma.notification.findMany({
    where: { id: { in: notificationIds } },
    include: { channel: true, app: true },
  });

  const now = new Date();
  let delivered = 0;
  let skipped = 0;

  for (const notification of notifications) {
    if (notification.status !== NotificationStatus.PENDING) {
      skipped++;
      continue;
    }

    const providerKey = notification.channel.providerKey;

    if (providerKey === "in-app") {
      const appCode = notification.app?.code ?? null;
      const target = appCode
        ? `sse:${appCode}:${notification.recipientUserId}:*`
        : `sse:*:${notification.recipientUserId}:*`;
      eventBus.publish({
        type: "notification.created",
        target,
        notificationId: notification.id,
        userId: notification.recipientUserId,
        renderedTitle: notification.renderedTitle,
        renderedBody: notification.renderedBody,
      });
      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: NotificationStatus.SENT, sentAt: now },
      });
      delivered++;
      continue;
    }

    if (providerKey === "smtp-email") {
      const user = await prisma.user.findUnique({
        where: { id: notification.recipientUserId },
        select: { email: true },
      });
      if (!user?.email) {
        await prisma.notification.update({
          where: { id: notification.id },
          data: {
            status: NotificationStatus.FAILED,
            failedAt: now,
            errorMessage: "Recipient has no email address",
          },
        });
        continue;
      }

      try {
        const mailer = await import("./mailer");
        const result = await mailer.sendSmtpEmail({
          channelId: notification.channelId,
          to: user.email,
          subject: notification.renderedSubject ?? "",
          body: notification.renderedBody,
        });
        if (!result) {
          throw new Error("Failed to send email: mailer unavailable");
        }
        await prisma.notification.update({
          where: { id: notification.id },
          data: {
            status: NotificationStatus.SENT,
            sentAt: result.sentAt,
            providerMessageId: result.messageId,
          },
        });
        delivered++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await prisma.notification.update({
          where: { id: notification.id },
          data: {
            status: NotificationStatus.FAILED,
            failedAt: now,
            errorMessage: msg,
          },
        });
      }
      continue;
    }

    // Unsupported provider (e.g. sms): leave as pending.
    skipped++;
  }

  return { delivered, skipped };
}
