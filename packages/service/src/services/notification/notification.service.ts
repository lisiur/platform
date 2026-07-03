import { randomUUID } from "node:crypto";
import { HTTPException } from "hono/http-exception";
import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";
import { getEnabledTemplateByKey } from "./template.service";
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

  const template = await getEnabledTemplateByKey(params.templateKey);

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

  const variables = params.variables ?? {};
  validateTemplateVariables(template.variablesSchema, variables);

  const renderedSubject = renderTemplate(template.subjectTemplate, variables);
  const renderedTitle = renderTemplate(template.titleTemplate, variables);
  const renderedBody = renderTemplate(template.bodyTemplate, variables) ?? "";

  const correlationId = randomUUID();
  const now = new Date();
  const inApp = template.channel.providerKey === "in-app";
  const isSmtp = template.channel.providerKey === "smtp-email";

  const mailer = isSmtp ? await import("./mailer") : null;

  const results = await Promise.all(
    recipientUserIds.map(async (recipientUserId) => {
      const notification = await prisma.notification.create({
        data: {
          correlationId,
          templateId: template.id,
          channelId: template.channelId,
          recipientUserId,
          appId: params.appId,
          creatorId: params.creatorId,
          source: params.source,
          variables: asInputJson(variables),
          renderedSubject,
          renderedTitle,
          renderedBody,
          status: inApp ? "sent" : "pending",
          sentAt: inApp ? now : undefined,
          metadata: asInputJson(params.metadata),
        },
      });

      if (isSmtp) {
        const user = await prisma.user.findUnique({
          where: { id: recipientUserId },
          select: { email: true },
        });
        if (user?.email) {
          try {
            const result = await mailer!.sendSmtpEmail({
              channelId: template.channelId,
              to: user.email,
              subject: renderedSubject ?? "",
              body: renderedBody,
            });
            await prisma.notification.update({
              where: { id: notification.id },
              data: {
                status: "sent",
                sentAt: result.sentAt,
                providerMessageId: result.messageId,
              },
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await prisma.notification.update({
              where: { id: notification.id },
              data: { status: "failed", failedAt: now, errorMessage: msg },
            });
          }
        } else {
          await prisma.notification.update({
            where: { id: notification.id },
            data: {
              status: "failed",
              failedAt: now,
              errorMessage: "Recipient has no email address",
            },
          });
        }
      }

      return notification;
    }),
  );

  return {
    correlationId,
    total: results.length,
    recipients: recipientUserIds.length,
    provider: template.channel.providerKey,
  };
}
