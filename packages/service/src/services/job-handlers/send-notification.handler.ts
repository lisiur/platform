import type { JobHandler } from "#lib/queues/job.types";
import { createNotificationsFromTemplate } from "#services/notification/notification.service";

export interface SendNotificationPayload {
  templateKey: string;
  recipientUserIds: string[];
  variables?: Record<string, unknown>;
  appId?: string | null;
  source?: string | null;
  creatorId?: string | null;
  metadata?: unknown;
}

export const sendNotificationHandler: JobHandler = async (job) => {
  const payload = (job.payload ?? {}) as Partial<SendNotificationPayload>;

  if (!payload.templateKey || typeof payload.templateKey !== "string") {
    throw new Error(
      "send-notification payload missing required field: templateKey",
    );
  }
  if (
    !Array.isArray(payload.recipientUserIds) ||
    payload.recipientUserIds.length === 0
  ) {
    throw new Error(
      "send-notification payload missing required field: recipientUserIds",
    );
  }

  const result = await createNotificationsFromTemplate({
    templateKey: payload.templateKey,
    recipientUserIds: payload.recipientUserIds,
    variables: payload.variables ?? {},
    appId: payload.appId ?? null,
    source: payload.source ?? null,
    creatorId: payload.creatorId ?? null,
    metadata: payload.metadata,
  });

  return result;
};
