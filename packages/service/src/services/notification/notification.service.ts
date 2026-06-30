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

  const notifications = recipientUserIds.map((recipientUserId) => ({
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
  }));

  await prisma.notification.createMany({ data: notifications });

  return {
    correlationId,
    total: notifications.length,
    recipients: recipientUserIds.length,
    provider: template.channel.providerKey,
  };
}
