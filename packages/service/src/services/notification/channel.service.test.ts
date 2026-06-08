import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/db", () => ({
  prisma: {
    notificationChannel: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "#lib/db";
import {
  createNotificationChannel,
  updateNotificationChannel,
} from "./channel.service";

const mockPrisma = prisma as unknown as {
  notificationChannel: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

describe("notification channel service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates a channel with validated config and redacts secrets", async () => {
    mockPrisma.notificationChannel.findUnique.mockResolvedValue(null);
    mockPrisma.notificationChannel.create.mockResolvedValue({
      id: "channel-1",
      key: "primary-email",
      name: "Primary Email",
      providerKey: "smtp-email",
      enabled: true,
      config: {
        host: "smtp.example.com",
        port: 587,
        secure: false,
        password: "secret",
        from: "noreply@example.com",
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    const channel = await createNotificationChannel({
      key: "primary-email",
      name: "Primary Email",
      providerKey: "smtp-email",
      config: {
        host: "smtp.example.com",
        port: 587,
        password: "secret",
        from: "noreply@example.com",
      },
    });

    expect(mockPrisma.notificationChannel.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        key: "primary-email",
        providerKey: "smtp-email",
        config: expect.objectContaining({ secure: false }),
      }),
    });
    expect(channel.config).toMatchObject({ password: "********" });
  });

  it("rejects duplicate channel keys", async () => {
    mockPrisma.notificationChannel.findUnique.mockResolvedValue({
      id: "existing",
    });

    await expect(
      createNotificationChannel({
        key: "in-app",
        name: "In-App",
        providerKey: "in-app",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("validates config when changing provider", async () => {
    mockPrisma.notificationChannel.findFirst.mockResolvedValue({
      id: "channel-1",
      key: "sms",
      name: "SMS",
      providerKey: "sms",
      enabled: true,
      config: { providerName: "demo", apiKey: "secret" },
      deletedAt: null,
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
      deletedAt: null,
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
      deletedAt: null,
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
      deletedAt: null,
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
