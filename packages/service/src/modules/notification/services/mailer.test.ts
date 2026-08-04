import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/db", () => ({
  prisma: { notificationChannel: { findFirst: vi.fn() } },
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn(),
    })),
  },
}));

import nodemailer from "nodemailer";
import { prisma } from "#lib/db";
import { sendSmtpEmail } from "./mailer";

const mockPrisma = prisma as unknown as {
  notificationChannel: { findFirst: ReturnType<typeof vi.fn> };
};

describe("sendSmtpEmail", () => {
  beforeEach(() => vi.resetAllMocks());

  it("sends email via nodemailer with channel config", async () => {
    const sendMailMock = vi.fn().mockResolvedValue({ messageId: "msg-123" });
    (nodemailer.createTransport as ReturnType<typeof vi.fn>).mockReturnValue({
      sendMail: sendMailMock,
    });

    mockPrisma.notificationChannel.findFirst.mockResolvedValue({
      id: "ch-1",
      providerKey: "smtp-email",
      enabled: true,
      config: {
        host: "smtp.example.com",
        port: 587,
        secure: false,
        username: "user",
        password: "pass",
        from: "noreply@example.com",
      },
    });

    const result = await sendSmtpEmail({
      channelId: "ch-1",
      to: "user@example.com",
      subject: "Hello",
      body: "World",
    });

    expect(result.messageId).toBe("msg-123");
    expect(sendMailMock).toHaveBeenCalledWith({
      from: "noreply@example.com",
      to: "user@example.com",
      subject: "Hello",
      html: "World",
      text: "World",
    });
  });

  it("converts html body into a plain-text fallback", async () => {
    const sendMailMock = vi.fn().mockResolvedValue({ messageId: "msg-html" });
    (nodemailer.createTransport as ReturnType<typeof vi.fn>).mockReturnValue({
      sendMail: sendMailMock,
    });

    mockPrisma.notificationChannel.findFirst.mockResolvedValue({
      id: "ch-1",
      providerKey: "smtp-email",
      enabled: true,
      config: {
        host: "smtp.example.com",
        port: 587,
        secure: false,
        from: "noreply@example.com",
      },
    });

    await sendSmtpEmail({
      channelId: "ch-1",
      to: "user@example.com",
      subject: "Hello",
      body: "<p>Hi <strong>Alice</strong>,</p><p>Welcome.</p>",
    });

    const call = sendMailMock.mock.calls[0][0];
    expect(call.html).toBe("<p>Hi <strong>Alice</strong>,</p><p>Welcome.</p>");
    expect(call.text).toContain("Hi Alice");
    expect(call.text).toContain("Welcome.");
    expect(call.text).not.toContain("<");
  });

  it("throws 400 when channel is not smtp-email", async () => {
    mockPrisma.notificationChannel.findFirst.mockResolvedValue({
      id: "ch-inapp",
      providerKey: "in-app",
      enabled: true,
      config: null,
    });

    await expect(
      sendSmtpEmail({
        channelId: "ch-inapp",
        to: "user@example.com",
        subject: "Hi",
        body: "x",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throws 404 when channel not found", async () => {
    mockPrisma.notificationChannel.findFirst.mockResolvedValue(null);

    await expect(
      sendSmtpEmail({
        channelId: "missing",
        to: "user@example.com",
        subject: "Hi",
        body: "x",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws 400 when channel is disabled", async () => {
    mockPrisma.notificationChannel.findFirst.mockResolvedValue({
      id: "ch-disabled",
      providerKey: "smtp-email",
      enabled: false,
      config: { host: "smtp.example.com", port: 587, from: "from@example.com" },
    });

    await expect(
      sendSmtpEmail({
        channelId: "ch-disabled",
        to: "user@example.com",
        subject: "Hi",
        body: "x",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("omits auth when username or password is missing", async () => {
    const sendMailMock = vi.fn().mockResolvedValue({ messageId: "msg-456" });
    const mockTransport = { sendMail: sendMailMock };
    (nodemailer.createTransport as ReturnType<typeof vi.fn>).mockReturnValue(
      mockTransport,
    );

    mockPrisma.notificationChannel.findFirst.mockResolvedValue({
      id: "ch-noauth",
      providerKey: "smtp-email",
      enabled: true,
      config: {
        host: "smtp.example.com",
        port: 587,
        secure: false,
        from: "from@example.com",
      },
    });

    await sendSmtpEmail({
      channelId: "ch-noauth",
      to: "to@example.com",
      subject: "Hi",
      body: "Test",
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const transportCall = (
      nodemailer.createTransport as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];
    expect(transportCall.auth).toBeUndefined();
  });

  it("omits auth when password is missing but username is present", async () => {
    const sendMailMock = vi.fn().mockResolvedValue({ messageId: "msg-789" });
    const mockTransport = { sendMail: sendMailMock };
    (nodemailer.createTransport as ReturnType<typeof vi.fn>).mockReturnValue(
      mockTransport,
    );

    mockPrisma.notificationChannel.findFirst.mockResolvedValue({
      id: "ch-partial",
      providerKey: "smtp-email",
      enabled: true,
      config: {
        host: "smtp.example.com",
        port: 587,
        secure: false,
        username: "user",
        from: "from@example.com",
      },
    });

    await sendSmtpEmail({
      channelId: "ch-partial",
      to: "to@example.com",
      subject: "Hi",
      body: "Test",
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const transportCall = (
      nodemailer.createTransport as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];
    expect(transportCall.auth).toBeUndefined();
  });

  it("rejects CR in recipient (SMTP header injection)", async () => {
    mockPrisma.notificationChannel.findFirst.mockResolvedValue({
      id: "ch-1",
      providerKey: "smtp-email",
      enabled: true,
      config: {
        host: "smtp.example.com",
        port: 587,
        from: "noreply@example.com",
      },
    });

    await expect(
      sendSmtpEmail({
        channelId: "ch-1",
        to: "victim@example.com\r\nBcc: leak@example.com",
        subject: "Hi",
        body: "x",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects LF in subject (SMTP header injection)", async () => {
    const sendMailMock = vi.fn().mockResolvedValue({ messageId: "msg-x" });
    (nodemailer.createTransport as ReturnType<typeof vi.fn>).mockReturnValue({
      sendMail: sendMailMock,
    });
    mockPrisma.notificationChannel.findFirst.mockResolvedValue({
      id: "ch-1",
      providerKey: "smtp-email",
      enabled: true,
      config: {
        host: "smtp.example.com",
        port: 587,
        from: "noreply@example.com",
      },
    });

    await expect(
      sendSmtpEmail({
        channelId: "ch-1",
        to: "victim@example.com",
        subject: "Hi\nBcc: leak@example.com",
        body: "x",
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("rejects malformed recipient address", async () => {
    mockPrisma.notificationChannel.findFirst.mockResolvedValue({
      id: "ch-1",
      providerKey: "smtp-email",
      enabled: true,
      config: {
        host: "smtp.example.com",
        port: 587,
        from: "noreply@example.com",
      },
    });

    await expect(
      sendSmtpEmail({
        channelId: "ch-1",
        to: "not-an-email",
        subject: "Hi",
        body: "x",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("accepts 'Name <email>' form for recipient", async () => {
    const sendMailMock = vi.fn().mockResolvedValue({ messageId: "msg-n" });
    (nodemailer.createTransport as ReturnType<typeof vi.fn>).mockReturnValue({
      sendMail: sendMailMock,
    });
    mockPrisma.notificationChannel.findFirst.mockResolvedValue({
      id: "ch-1",
      providerKey: "smtp-email",
      enabled: true,
      config: {
        host: "smtp.example.com",
        port: 587,
        from: "noreply@example.com",
      },
    });

    await sendSmtpEmail({
      channelId: "ch-1",
      to: "Alice <alice@example.com>",
      subject: "Hi",
      body: "x",
    });

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "Alice <alice@example.com>" }),
    );
  });
});
