import { HTTPException } from "hono/http-exception";
import { htmlToText } from "html-to-text";
import type { Transporter } from "nodemailer";
import nodemailer from "nodemailer";
import { z } from "zod";
import { getChannelById } from "./channel.service";
import {
  emailAddressField,
  singleLineTextField,
  smtpEmailConfigSchema,
} from "./provider";

export interface SendEmailResult {
  messageId: string;
  sentAt: Date;
}

const sendEmailParamsSchema = z.object({
  channelId: z.string().min(1),
  to: emailAddressField,
  subject: singleLineTextField,
  body: z.string(),
});

export async function sendSmtpEmail(params: {
  channelId: string;
  to: string;
  subject: string;
  body: string;
}): Promise<SendEmailResult> {
  let parsed: z.infer<typeof sendEmailParamsSchema>;
  try {
    parsed = sendEmailParamsSchema.parse(params);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new HTTPException(400, { message: "Invalid email parameters" });
    }
    throw error;
  }

  const channel = await getChannelById(parsed.channelId);

  if (channel.providerKey !== "smtp-email") {
    throw new HTTPException(400, {
      message: `Channel ${channel.id} is not an smtp-email channel`,
    });
  }

  if (!channel.config || !channel.enabled) {
    throw new HTTPException(400, {
      message: `Channel ${channel.id} is not configured or not enabled`,
    });
  }

  const config = smtpEmailConfigSchema.parse(channel.config);

  const transporter: Transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
    auth:
      config.username && config.password
        ? { user: config.username, pass: config.password }
        : undefined,
  });

  const info = await transporter.sendMail({
    from: config.from,
    to: parsed.to,
    subject: parsed.subject,
    html: parsed.body,
    text: htmlToText(parsed.body, {
      wordwrap: 80,
      selectors: [
        { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
      ],
    }),
  });

  return { messageId: info.messageId, sentAt: new Date() };
}
