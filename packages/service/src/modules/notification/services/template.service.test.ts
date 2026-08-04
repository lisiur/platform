import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/db", () => ({
  prisma: {
    notificationTemplate: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("./channel.service", () => ({
  getNotificationChannel: vi.fn(),
  redactNotificationChannel: (channel: unknown) => channel,
}));

vi.mock("#states", () => ({
  notificationTemplateCache: {
    get: vi.fn(),
    set: vi.fn(),
    clear: vi.fn(),
  },
}));

import { prisma } from "#lib/db";
import { notificationTemplateCache } from "#states";
import { getNotificationChannel } from "./channel.service";
import {
  findTemplateForDelivery,
  updateNotificationTemplate,
} from "./template.service";

const mockPrisma = prisma as unknown as {
  notificationTemplate: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

const mockGetChannel = getNotificationChannel as ReturnType<typeof vi.fn>;

function channelWith(providerKey: string) {
  return {
    id: "ch-1",
    providerKey,
    enabled: true,
    config: {},
  };
}

describe("notification template headline validation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects when switching channel to smtp-email without subject on update", async () => {
    mockPrisma.notificationTemplate.findFirst.mockResolvedValue({
      id: "tpl-1",
      channelId: "ch-in-app",
      subjectTemplate: null,
      titleTemplate: "Old title",
      channel: channelWith("in-app"),
    });
    mockGetChannel.mockResolvedValue(channelWith("smtp-email"));

    await expect(
      updateNotificationTemplate("tpl-1", {
        channelId: "ch-email",
        subjectTemplate: null,
        titleTemplate: null,
      }),
    ).rejects.toMatchObject({ status: 400 });

    expect(mockPrisma.notificationTemplate.update).not.toHaveBeenCalled();
  });

  it("clears title when updating smtp-email template", async () => {
    mockPrisma.notificationTemplate.findFirst.mockResolvedValue({
      id: "tpl-1",
      channelId: "ch-email",
      subjectTemplate: "Welcome",
      titleTemplate: "stale",
      channel: channelWith("smtp-email"),
    });
    mockPrisma.notificationTemplate.update.mockResolvedValue({
      id: "tpl-1",
      channel: channelWith("smtp-email"),
    });

    await updateNotificationTemplate("tpl-1", {
      subjectTemplate: "Welcome",
      titleTemplate: null,
    });

    expect(mockPrisma.notificationTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "tpl-1" },
        data: expect.objectContaining({
          subjectTemplate: "Welcome",
          titleTemplate: null,
        }),
      }),
    );
  });

  it("allows editing when the target channel is disabled", async () => {
    mockPrisma.notificationTemplate.findFirst.mockResolvedValue({
      id: "tpl-1",
      channelId: "ch-email",
      subjectTemplate: "Welcome",
      titleTemplate: null,
      channel: { ...channelWith("smtp-email"), enabled: false },
    });
    mockGetChannel.mockResolvedValue({
      ...channelWith("smtp-email"),
      enabled: false,
    });
    mockPrisma.notificationTemplate.update.mockResolvedValue({
      id: "tpl-1",
      channel: { ...channelWith("smtp-email"), enabled: false },
    });

    await updateNotificationTemplate("tpl-1", {
      channelId: "ch-email",
      bodyTemplate: "<p>Updated</p>",
    });

    expect(mockPrisma.notificationTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "tpl-1" },
        data: expect.objectContaining({ bodyTemplate: "<p>Updated</p>" }),
      }),
    );
  });
});

describe("findTemplateForDelivery", () => {
  const mockCache = notificationTemplateCache as unknown as {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };

  function templateWith(overrides: Record<string, unknown> = {}) {
    return {
      id: "tpl-1",
      key: "notice",
      channelId: "ch-1",
      enabled: true,
      subjectTemplate: null,
      titleTemplate: null,
      bodyTemplate: "Hello",
      variablesSchema: null,
      channel: {
        id: "ch-1",
        providerKey: "in-app",
        enabled: true,
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.resetAllMocks();
    mockCache.get.mockReturnValue(null);
  });

  it("returns null when no template matches the key", async () => {
    mockPrisma.notificationTemplate.findFirst.mockResolvedValue(null);

    await expect(findTemplateForDelivery("missing")).resolves.toBeNull();
  });

  it("reports a disabled reason when the template is disabled", async () => {
    mockPrisma.notificationTemplate.findFirst.mockResolvedValue(
      templateWith({ key: "welcome", enabled: false }),
    );

    const result = await findTemplateForDelivery("welcome");

    expect(result?.template.key).toBe("welcome");
    expect(result?.disabledReason).toContain("disabled");
    expect(mockCache.set).not.toHaveBeenCalled();
  });

  it("reports a disabled reason when the channel is disabled", async () => {
    mockPrisma.notificationTemplate.findFirst.mockResolvedValue(
      templateWith({
        key: "welcome-email",
        channel: {
          id: "ch-email",
          providerKey: "smtp-email",
          enabled: false,
        },
      }),
    );

    const result = await findTemplateForDelivery("welcome-email");

    expect(result?.disabledReason).toContain("disabled");
    expect(mockCache.set).not.toHaveBeenCalled();
  });

  it("caches an enabled template with no disabled reason", async () => {
    mockPrisma.notificationTemplate.findFirst.mockResolvedValue(templateWith());

    const result = await findTemplateForDelivery("notice");

    expect(result?.disabledReason).toBeNull();
    expect(mockCache.set).toHaveBeenCalledWith("notice", expect.anything());
  });

  it("serves a cached template without querying the database", async () => {
    mockCache.get.mockReturnValue(templateWith());

    const result = await findTemplateForDelivery("notice");

    expect(result?.disabledReason).toBeNull();
    expect(mockPrisma.notificationTemplate.findFirst).not.toHaveBeenCalled();
  });
});
