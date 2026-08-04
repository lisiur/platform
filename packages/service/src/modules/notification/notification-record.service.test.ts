import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/db", () => ({
  prisma: {
    notification: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "#lib/db";
import {
  getNotificationRecordById,
  listNotificationRecords,
} from "./notification-record.service";

const mockPrisma = prisma as unknown as {
  notification: {
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
};

describe("notification record service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPrisma.notification.findMany.mockResolvedValue([]);
    mockPrisma.notification.count.mockResolvedValue(0);
  });

  it("lists records with pagination and default active archive filter", async () => {
    await listNotificationRecords({ limit: 20, offset: 40 });

    expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { archivedAt: null },
        orderBy: { createdAt: "desc" },
        take: 20,
        skip: 40,
      }),
    );
    expect(mockPrisma.notification.count).toHaveBeenCalledWith({
      where: { archivedAt: null },
    });
    const findManyArg = mockPrisma.notification.findMany.mock.calls[0][0];
    expect(findManyArg.select).toEqual(
      expect.objectContaining({
        id: true,
        renderedTitle: true,
        recipient: expect.any(Object),
        template: expect.any(Object),
        channel: expect.any(Object),
      }),
    );
    expect(findManyArg.select.variables).toBeUndefined();
    expect(findManyArg.select.renderedBody).toBeUndefined();
    expect(findManyArg.select.metadata).toBeUndefined();
    expect(findManyArg.select.providerMessageId).toBeUndefined();
  });

  it("applies admin filters for recipient, template, channel, state, and dates", async () => {
    const startDate = new Date("2026-01-01T00:00:00.000Z");
    const endDate = new Date("2026-01-31T23:59:59.999Z");

    await listNotificationRecords({
      recipientEmail: "alice@example.com",
      recipientName: "Alice",
      templateKey: "welcome",
      providerKey: "in-app",
      status: "SENT",
      readState: "unread",
      archivedState: "all",
      source: "auth",
      correlationId: "corr",
      startDate,
      endDate,
    });

    expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          recipient: {
            email: { contains: "alice@example.com", mode: "insensitive" },
            name: { contains: "Alice", mode: "insensitive" },
          },
          template: { key: "welcome" },
          channel: { providerKey: "in-app" },
          status: "SENT",
          readAt: null,
          source: { contains: "auth", mode: "insensitive" },
          correlationId: { contains: "corr", mode: "insensitive" },
          createdAt: { gte: startDate, lte: endDate },
        },
      }),
    );
  });

  it("gets one record by id", async () => {
    mockPrisma.notification.findUnique.mockResolvedValue({ id: "n1" });

    await expect(getNotificationRecordById("n1")).resolves.toEqual({
      id: "n1",
    });
    expect(mockPrisma.notification.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "n1" } }),
    );
  });

  it("throws 404 when a record is not found", async () => {
    mockPrisma.notification.findUnique.mockResolvedValue(null);

    await expect(getNotificationRecordById("missing")).rejects.toMatchObject({
      status: 404,
    });
  });
});
