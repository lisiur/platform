import type { JobHandler } from "#lib/queues/job.types";
import { deliverNotifications } from "#modules/notification/services/notification.service";

export interface SendNotificationPayload {
  notificationIds: string[];
}

export const sendNotificationHandler: JobHandler = async (job) => {
  const payload = (job.payload ?? {}) as Partial<SendNotificationPayload>;

  if (
    !Array.isArray(payload.notificationIds) ||
    payload.notificationIds.length === 0
  ) {
    throw new Error(
      "send-notification payload missing required field: notificationIds",
    );
  }

  return deliverNotifications(payload.notificationIds);
};
