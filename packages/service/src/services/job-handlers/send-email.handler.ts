import { prisma } from "#lib/db";
import type { JobHandler } from "#lib/queues/job.types";
import { sendSmtpEmail } from "#services/notification/mailer";

export interface SendEmailPayload {
  to: string;
  subject: string;
  body: string;
  channelId?: string;
}

async function resolveSmtpChannelId(channelId?: string): Promise<string> {
  if (channelId) return channelId;

  const channel = await prisma.notificationChannel.findFirst({
    where: { providerKey: "smtp-email", enabled: true, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });

  if (!channel) {
    throw new Error(
      "No enabled smtp-email channel found — provide channelId or configure an SMTP channel",
    );
  }

  return channel.id;
}

export const sendEmailHandler: JobHandler = async (job) => {
  const payload = (job.payload ?? {}) as Partial<SendEmailPayload>;

  if (!payload.to || typeof payload.to !== "string") {
    throw new Error("send-email payload missing required field: to");
  }
  if (!payload.subject || typeof payload.subject !== "string") {
    throw new Error("send-email payload missing required field: subject");
  }
  if (!payload.body || typeof payload.body !== "string") {
    throw new Error("send-email payload missing required field: body");
  }

  const channelId = await resolveSmtpChannelId(payload.channelId);

  const result = await sendSmtpEmail({
    channelId,
    to: payload.to,
    subject: payload.subject,
    body: payload.body,
  });

  return { messageId: result.messageId, sentAt: result.sentAt.toISOString() };
};
