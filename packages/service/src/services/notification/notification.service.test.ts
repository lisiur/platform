import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/db", () => ({
  prisma: {
    notificationTemplate: { findFirst: vi.fn() },
    user: { findMany: vi.fn(), findUnique: vi.fn() },
    notification: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("#repositories/job.repository", () => ({
  jobRepository: { create: vi.fn() },
}));

vi.mock("#states", () => ({
  eventBus: { emit: vi.fn() },
  jobExecutor: { enqueue: vi.fn() },
  globalCache: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
    getOrSet: vi.fn(),
  },
  notificationChannelCache: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
  },
  notificationTemplateCache: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
  },
}));

vi.mock("./mailer", () => ({ sendSmtpEmail: vi.fn() }));

import { prisma } from "#lib/db";
import { jobRepository } from "#repositories/job.repository";
import { eventBus, jobExecutor } from "#states";
import {
  notificationChannelCache,
  notificationTemplateCache,
} from "#states";
import { sendSmtpEmail } from "./mailer";
import {
  createNotificationsFromTemplate,
  deliverNotifications,
} from "./notification.service";

const mockPrisma = prisma as unknown as {
  notificationTemplate: { findFirst: ReturnType<typeof vi.fn> };
  user: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  notification: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

const mockJobRepository = jobRepository as unknown as {
  create: ReturnType<typeof vi.fn>;
};
const mockEventBus = eventBus as unknown as { emit: ReturnType<typeof vi.fn> };
const mockJobExecutor = jobExecutor as unknown as {
  enqueue: ReturnType<typeof vi.fn>;
};
const mockSendSmtpEmail = sendSmtpEmail as ReturnType<typeof vi.fn>;

function enabledTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: "tpl-1",
    key: "notice",
    channelId: "ch-1",
    enabled: true,
    subjectTemplate: null,
    titleTemplate: null,
    bodyTemplate: "Hello {{userName}}",
    variablesSchema: null,
    channel: {
      id: "ch-1",
      providerKey: "in-app",
      enabled: true,
      deletedAt: null,
    },
    ...overrides,
  };
}

describe("notification runtime service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    notificationChannelCache.clear();
    notificationTemplateCache.clear();

    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: unknown) => Promise<unknown>) =>
        cb({ notification: { create: mockPrisma.notification.create } }),
    );
    mockPrisma.notification.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: `n-${data.recipientUserId}` }),
    );
  });

  describe("createNotificationsFromTemplate", () => {
    it("creates pending rows and enqueues one batch delivery job", async () => {
      mockPrisma.notificationTemplate.findFirst.mockResolvedValue(
        enabledTemplate({
          channel: {
            id: "ch-email",
            providerKey: "smtp-email",
            enabled: true,
            deletedAt: null,
          },
        }),
      );
      mockPrisma.user.findMany.mockResolvedValue([{ id: "u1" }, { id: "u2" }]);
      mockJobRepository.create.mockResolvedValue({ id: "job-1" });

      const result = await createNotificationsFromTemplate({
        templateKey: "notice",
        recipientUserIds: ["u1", "u2"],
        variables: { userName: "Alice" },
      });

      expect(result.pending).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.notificationIds).toHaveLength(2);
      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
      expect(mockJobRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "send-notification",
          payload: {
            notificationIds: expect.arrayContaining(["n-u1", "n-u2"]),
          },
        }),
        expect.anything(),
      );
      expect(mockJobExecutor.enqueue).toHaveBeenCalledWith({ id: "job-1" });
    });

    it("records failed rows when the channel is disabled and skips delivery", async () => {
      mockPrisma.notificationTemplate.findFirst.mockResolvedValue(
        enabledTemplate({
          key: "welcome-email",
          channelId: "ch-email",
          channel: {
            id: "ch-email",
            providerKey: "smtp-email",
            enabled: false,
            deletedAt: null,
          },
        }),
      );
      mockPrisma.user.findMany.mockResolvedValue([{ id: "u1" }]);

      const result = await createNotificationsFromTemplate({
        templateKey: "welcome-email",
        recipientUserIds: ["u1"],
      });

      expect(result.failed).toBe(1);
      expect(result.pending).toBe(0);
      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "failed",
            errorMessage: expect.stringContaining("disabled"),
          }),
        }),
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockJobRepository.create).not.toHaveBeenCalled();
      expect(mockJobExecutor.enqueue).not.toHaveBeenCalled();
    });

    it("returns 404 when the template key does not exist", async () => {
      mockPrisma.notificationTemplate.findFirst.mockResolvedValue(null);

      await expect(
        createNotificationsFromTemplate({
          templateKey: "missing",
          recipientUserIds: ["u1"],
        }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("rejects empty recipients before any database work", async () => {
      await expect(
        createNotificationsFromTemplate({
          templateKey: "notice",
          recipientUserIds: [],
        }),
      ).rejects.toMatchObject({ status: 400 });
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });

    it("rejects invalid variables before creating rows", async () => {
      mockPrisma.notificationTemplate.findFirst.mockResolvedValue(
        enabledTemplate({ variablesSchema: { required: ["userName"] } }),
      );
      mockPrisma.user.findMany.mockResolvedValue([{ id: "u1" }]);

      await expect(
        createNotificationsFromTemplate({
          templateKey: "notice",
          recipientUserIds: ["u1"],
          variables: {},
        }),
      ).rejects.toMatchObject({ status: 400 });
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });
  });

  describe("deliverNotifications", () => {
    it("delivers in-app notifications via the event bus and marks sent", async () => {
      mockPrisma.notification.findMany.mockResolvedValue([
        {
          id: "n1",
          status: "pending",
          recipientUserId: "u1",
          appId: null,
          renderedTitle: "Hi",
          renderedBody: "Hello",
          channelId: "ch-in",
          channel: { providerKey: "in-app" },
        },
      ]);

      const result = await deliverNotifications(["n1"]);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        "u1",
        expect.objectContaining({
          type: "notification.created",
          notificationId: "n1",
        }),
      );
      expect(mockPrisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "n1" },
          data: expect.objectContaining({ status: "sent" }),
        }),
      );
      expect(result.delivered).toBe(1);
    });

    it("delivers smtp-email and records the provider message id", async () => {
      mockSendSmtpEmail.mockResolvedValue({
        messageId: "msg-1",
        sentAt: new Date(),
      });
      mockPrisma.notification.findMany.mockResolvedValue([
        {
          id: "n1",
          status: "pending",
          recipientUserId: "u1",
          renderedSubject: "Welcome",
          renderedTitle: null,
          renderedBody: "Hi",
          channelId: "ch-email",
          channel: { providerKey: "smtp-email" },
        },
      ]);
      mockPrisma.user.findUnique.mockResolvedValue({ email: "u1@example.com" });

      const result = await deliverNotifications(["n1"]);

      expect(mockSendSmtpEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          channelId: "ch-email",
          to: "u1@example.com",
          subject: "Welcome",
          body: "Hi",
        }),
      );
      expect(mockPrisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "n1" },
          data: expect.objectContaining({
            status: "sent",
            providerMessageId: "msg-1",
          }),
        }),
      );
      expect(result.delivered).toBe(1);
    });

    it("marks smtp-email failed when the recipient has no email", async () => {
      mockPrisma.notification.findMany.mockResolvedValue([
        {
          id: "n1",
          status: "pending",
          recipientUserId: "u1",
          renderedSubject: "Welcome",
          renderedTitle: null,
          renderedBody: "Hi",
          channelId: "ch-email",
          channel: { providerKey: "smtp-email" },
        },
      ]);
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await deliverNotifications(["n1"]);

      expect(mockSendSmtpEmail).not.toHaveBeenCalled();
      expect(mockPrisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "n1" },
          data: expect.objectContaining({
            status: "failed",
            errorMessage: "Recipient has no email address",
          }),
        }),
      );
    });

    it("skips notifications that are no longer pending", async () => {
      mockPrisma.notification.findMany.mockResolvedValue([
        {
          id: "n1",
          status: "sent",
          recipientUserId: "u1",
          appId: null,
          renderedTitle: null,
          renderedBody: "Hi",
          channelId: "ch-in",
          channel: { providerKey: "in-app" },
        },
      ]);

      const result = await deliverNotifications(["n1"]);

      expect(mockEventBus.emit).not.toHaveBeenCalled();
      expect(mockPrisma.notification.update).not.toHaveBeenCalled();
      expect(result.delivered).toBe(0);
      expect(result.skipped).toBe(1);
    });
  });
});
