import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/db", () => ({
  prisma: {
    user: { findMany: vi.fn() },
    notificationTemplate: { findFirst: vi.fn() },
    notification: { createMany: vi.fn() },
  },
}));

import { prisma } from "#lib/db";
import { notificationCache } from "./cache";
import { createNotificationsFromTemplate } from "./notification.service";

const mockPrisma = prisma as unknown as {
  user: { findMany: ReturnType<typeof vi.fn> };
  notificationTemplate: { findFirst: ReturnType<typeof vi.fn> };
  notification: { createMany: ReturnType<typeof vi.fn> };
};

describe("notification runtime service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    notificationCache.invalidateAll();
  });

  it("creates one notification per recipient from template", async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ id: "u1" }, { id: "u2" }]);
    mockPrisma.notificationTemplate.findFirst.mockResolvedValue({
      id: "tpl-email",
      key: "user-welcome.email",
      channelId: "ch-email",
      subjectTemplate: "Welcome {{name}}",
      titleTemplate: null,
      bodyTemplate: "Hello {{name}}",
      variablesSchema: { required: ["name"] },
      channel: { providerKey: "smtp-email" },
    });
    mockPrisma.notification.createMany.mockResolvedValue({ count: 2 });

    const result = await createNotificationsFromTemplate({
      templateKey: "user-welcome.email",
      recipientUserIds: ["u1", "u2"],
      variables: { name: "Alice" },
      creatorId: "admin",
      source: "test",
      metadata: { reason: "signup" },
    });

    expect(result.total).toBe(2);
    expect(result.provider).toBe("smtp-email");
    expect(mockPrisma.notification.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          templateId: "tpl-email",
          recipientUserId: "u1",
          renderedSubject: "Welcome Alice",
          renderedBody: "Hello Alice",
          status: "pending",
        }),
        expect.objectContaining({
          templateId: "tpl-email",
          recipientUserId: "u2",
          renderedSubject: "Welcome Alice",
          status: "pending",
        }),
      ]),
    });
  });

  it("fails before creating rows when variables are missing", async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ id: "u1" }]);
    mockPrisma.notificationTemplate.findFirst.mockResolvedValue({
      id: "tpl-email",
      key: "user-welcome.email",
      channelId: "ch-email",
      subjectTemplate: "Welcome {{name}}",
      titleTemplate: null,
      bodyTemplate: "Hello {{name}}",
      variablesSchema: { required: ["name"] },
      channel: { providerKey: "smtp-email" },
    });

    await expect(
      createNotificationsFromTemplate({
        templateKey: "user-welcome.email",
        recipientUserIds: ["u1"],
        variables: {},
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(mockPrisma.notification.createMany).not.toHaveBeenCalled();
  });

  it("rejects missing recipients before creating rows", async () => {
    mockPrisma.notificationTemplate.findFirst.mockResolvedValue({
      id: "tpl-in-app",
      key: "user-welcome.in-app",
      channelId: "ch-in-app",
      bodyTemplate: "Hello",
      variablesSchema: null,
      channel: { providerKey: "in-app" },
    });
    mockPrisma.user.findMany.mockResolvedValue([]);

    await expect(
      createNotificationsFromTemplate({
        templateKey: "user-welcome.in-app",
        recipientUserIds: ["missing"],
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(mockPrisma.notification.createMany).not.toHaveBeenCalled();
  });

  it("returns 404 when template is not found", async () => {
    mockPrisma.notificationTemplate.findFirst.mockResolvedValue(null);

    await expect(
      createNotificationsFromTemplate({
        templateKey: "missing",
        recipientUserIds: ["u1"],
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("uses a single correlation id for all created rows", async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ id: "u1" }, { id: "u2" }]);
    mockPrisma.notificationTemplate.findFirst.mockResolvedValue({
      id: "tpl-in-app",
      key: "notice",
      channelId: "ch-in-app",
      bodyTemplate: "Body",
      variablesSchema: null,
      channel: { providerKey: "in-app" },
    });
    mockPrisma.notification.createMany.mockImplementation(({ data }) => {
      const ids = new Set(
        data.map((item: { correlationId: string }) => item.correlationId),
      );
      expect(ids.size).toBe(1);
      return Promise.resolve({ count: data.length });
    });

    await createNotificationsFromTemplate({
      templateKey: "notice",
      recipientUserIds: ["u1", "u2"],
    });

    expect(mockPrisma.notification.createMany).toHaveBeenCalled();
  });
});
