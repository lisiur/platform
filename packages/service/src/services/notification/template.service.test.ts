import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/db", () => ({
  prisma: {
    notificationTemplate: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("./channel.service", () => ({
  getActiveNotificationChannel: vi.fn(),
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
import { getActiveNotificationChannel } from "./channel.service";
import {
  createNotificationTemplate,
  findTemplateForDelivery,
  updateNotificationTemplate,
} from "./template.service";

const mockPrisma = prisma as unknown as {
  notificationTemplate: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

const mockGetActiveChannel = getActiveNotificationChannel as ReturnType<
  typeof vi.fn
>;

function channelWith(providerKey: string) {
  return {
    id: "ch-1",
    providerKey,
    enabled: true,
    deletedAt: null,
    config: {},
  };
}

describe("notification template headline validation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("requires titleTemplate for in-app channel on create", async () => {
    mockGetActiveChannel.mockResolvedValue(channelWith("in-app"));

    await expect(
      createNotificationTemplate({
        key: "welcome",
        channelId: "ch-1",
        name: "Welcome",
        bodyTemplate: "Hello",
        titleTemplate: null,
        subjectTemplate: null,
      }),
    ).rejects.toMatchObject({ status: 400 });

    expect(mockPrisma.notificationTemplate.create).not.toHaveBeenCalled();
  });

  it("requires subjectTemplate for smtp-email channel on create", async () => {
    mockGetActiveChannel.mockResolvedValue(channelWith("smtp-email"));

    await expect(
      createNotificationTemplate({
        key: "welcome-email",
        channelId: "ch-1",
        name: "Welcome Email",
        bodyTemplate: "Hello",
        subjectTemplate: null,
        titleTemplate: null,
      }),
    ).rejects.toMatchObject({ status: 400 });

    expect(mockPrisma.notificationTemplate.create).not.toHaveBeenCalled();
  });

  it("allows sms template with neither headline field", async () => {
    mockGetActiveChannel.mockResolvedValue(channelWith("sms"));
    mockPrisma.notificationTemplate.create.mockResolvedValue({
      id: "tpl-1",
      channel: channelWith("sms"),
    });

    await createNotificationTemplate({
      key: "welcome-sms",
      channelId: "ch-1",
      name: "Welcome SMS",
      bodyTemplate: "Hello",
    });

    expect(mockPrisma.notificationTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subjectTemplate: null,
          titleTemplate: null,
        }),
      }),
    );
  });

  it("coerces stray subjectTemplate to null for in-app channel", async () => {
    mockGetActiveChannel.mockResolvedValue(channelWith("in-app"));
    mockPrisma.notificationTemplate.create.mockResolvedValue({
      id: "tpl-1",
      channel: channelWith("in-app"),
    });

    await createNotificationTemplate({
      key: "welcome",
      channelId: "ch-1",
      name: "Welcome",
      bodyTemplate: "Hello",
      titleTemplate: "Welcome!",
      subjectTemplate: "should be dropped",
    });

    expect(mockPrisma.notificationTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          titleTemplate: "Welcome!",
          subjectTemplate: null,
        }),
      }),
    );
  });

  it("coerces stray titleTemplate to null for smtp-email channel", async () => {
    mockGetActiveChannel.mockResolvedValue(channelWith("smtp-email"));
    mockPrisma.notificationTemplate.create.mockResolvedValue({
      id: "tpl-1",
      channel: channelWith("smtp-email"),
    });

    await createNotificationTemplate({
      key: "welcome-email",
      channelId: "ch-1",
      name: "Welcome Email",
      bodyTemplate: "Hello",
      subjectTemplate: "Welcome",
      titleTemplate: "should be dropped",
    });

    expect(mockPrisma.notificationTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subjectTemplate: "Welcome",
          titleTemplate: null,
        }),
      }),
    );
  });

  it("rejects when switching channel to smtp-email without subject on update", async () => {
    mockPrisma.notificationTemplate.findFirst.mockResolvedValue({
      id: "tpl-1",
      channelId: "ch-in-app",
      subjectTemplate: null,
      titleTemplate: "Old title",
      channel: channelWith("in-app"),
    });
    mockGetActiveChannel.mockResolvedValue(channelWith("smtp-email"));

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
        deletedAt: null,
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
          deletedAt: null,
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
