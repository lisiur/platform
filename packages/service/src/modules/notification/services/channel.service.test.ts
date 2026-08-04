import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/db", () => ({
  prisma: {
    notificationChannel: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "#lib/db";
import { updateNotificationChannel } from "./channel.service";

const mockPrisma = prisma as unknown as {
  notificationChannel: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

describe("notification channel service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("validates config when changing provider", async () => {
    mockPrisma.notificationChannel.findFirst.mockResolvedValue({
      id: "channel-1",
      key: "sms",
      name: "SMS",
      providerKey: "sms",
      enabled: true,
      config: { providerName: "demo", apiKey: "secret" },
    });

    await expect(
      updateNotificationChannel("channel-1", {
        providerKey: "smtp-email",
        config: { host: "smtp.example.com" },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("requires config when changing provider type", async () => {
    mockPrisma.notificationChannel.findFirst.mockResolvedValue({
      id: "channel-1",
      key: "sms",
      name: "SMS",
      providerKey: "sms",
      enabled: true,
      config: { providerName: "demo", apiKey: "secret" },
    });

    await expect(
      updateNotificationChannel("channel-1", { providerKey: "smtp-email" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("preserves existing secrets when clients submit redacted config", async () => {
    mockPrisma.notificationChannel.findFirst.mockResolvedValue({
      id: "channel-1",
      key: "primary-email",
      name: "Primary Email",
      providerKey: "smtp-email",
      enabled: true,
      config: {
        host: "smtp.example.com",
        port: 587,
        secure: false,
        password: "real-secret",
        from: "noreply@example.com",
      },
    });
    mockPrisma.notificationChannel.update.mockResolvedValue({
      id: "channel-1",
      key: "primary-email",
      name: "Primary Email",
      providerKey: "smtp-email",
      enabled: true,
      config: {
        host: "smtp2.example.com",
        port: 587,
        secure: false,
        password: "real-secret",
        from: "noreply@example.com",
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await updateNotificationChannel("channel-1", {
      config: {
        host: "smtp2.example.com",
        port: 587,
        secure: false,
        password: "********",
        from: "noreply@example.com",
      },
    });

    expect(mockPrisma.notificationChannel.update).toHaveBeenCalledWith({
      where: { id: "channel-1" },
      data: expect.objectContaining({
        config: expect.objectContaining({ password: "real-secret" }),
      }),
    });
  });
});
