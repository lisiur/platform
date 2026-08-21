import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    member: { findMany: vi.fn() },
    account: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("#lib/logger", () => ({
  logAudit: vi.fn(),
}));

vi.mock("#lib/session", () => ({
  createSession: vi.fn(),
  deleteSessionByToken: vi.fn(),
  getSessionFromHeaders: vi.fn(),
}));

vi.mock("#lib/apple", () => ({
  verifyAppleIdentityToken: vi.fn(),
}));

vi.mock("#modules/system/system-config.repository", () => ({
  systemConfigRepository: { findByGroup: vi.fn() },
}));

vi.mock("#modules/notification/services/notification.service", () => ({
  createNotificationsFromTemplate: vi.fn(),
}));

vi.mock("#modules/pricing/public", () => ({
  subscribeUserToBasicPlan: vi.fn(),
}));

vi.mock("#states", () => ({
  eventBus: { close: vi.fn() },
}));

import { verifyAppleIdentityToken } from "#lib/apple";
import { prisma } from "#lib/db";
import { createSession } from "#lib/session";
import { subscribeUserToBasicPlan } from "#modules/pricing/public";
import { signInWithApple } from "./auth.service";

const mockPrisma = prisma as unknown as {
  user: { create: ReturnType<typeof vi.fn> };
  member: { findMany: ReturnType<typeof vi.fn> };
  account: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};
const mockVerifyToken = verifyAppleIdentityToken as unknown as ReturnType<
  typeof vi.fn
>;
const mockCreateSession = createSession as unknown as ReturnType<typeof vi.fn>;
const mockSubscribe = subscribeUserToBasicPlan as unknown as ReturnType<
  typeof vi.fn
>;

import { systemConfigRepository } from "#modules/system/system-config.repository";

const mockFindByGroup =
  systemConfigRepository.findByGroup as unknown as ReturnType<typeof vi.fn>;

const token = {
  sub: "apple-sub-123456789",
  email: "john@privaterelay.appleid.com",
  emailVerified: true,
  isPrivateEmail: true,
};

const session = { id: "sess_1", token: "tok", userId: "user_1" };
const appleAccount = {
  id: "acct_apple_1",
  providerId: "apple",
  accountId: token.sub,
  providerData: { sub: token.sub },
  userId: "user_1",
  user: {
    id: "user_1",
    name: "John",
    email: "john@example.com",
    emailVerified: true,
    banned: false,
    flags: [],
  },
};

const baseParams = {
  identityToken: "header.payload.signature",
  nonce: "nonce-abc",
  ipAddress: "203.0.113.10",
  traceId: "trace-xyz",
  userAgent: "vitest/1.0",
};

function configRows(group: string, rows: Record<string, string>) {
  return Object.entries(rows).map(([key, value]) => ({
    group,
    key,
    value,
    label: key,
    description: null,
    type: "string",
    isSecret: false,
    sortOrder: 0,
    updatedAt: new Date(),
  }));
}

async function expectStatus(
  fn: () => Promise<unknown>,
  status: number,
): Promise<void> {
  const err = await fn().catch((e) => e);
  expect(err).toBeInstanceOf(HTTPException);
  expect((err as HTTPException).status).toBe(status);
}

describe("signInWithApple", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyToken.mockResolvedValue(token);
    mockCreateSession.mockResolvedValue(session);
    mockSubscribe.mockResolvedValue(undefined);
    mockPrisma.member.findMany.mockResolvedValue([]);
    mockFindByGroup.mockImplementation(async (group: string) => {
      if (group === "auth") {
        return configRows("auth", { "registration.enabled": "true" });
      }
      if (group === "apple") {
        return configRows("apple", {
          clientId: "com.example.web",
          appAudiences: "top.hapaul.Yulai",
        });
      }
      return [];
    });
  });

  it("throws 500 when Apple is not configured", async () => {
    mockFindByGroup.mockImplementation(async (group: string) =>
      group === "apple"
        ? []
        : configRows("auth", { "registration.enabled": "true" }),
    );

    await expectStatus(() => signInWithApple(baseParams), 500);
    expect(mockVerifyToken).not.toHaveBeenCalled();
  });

  it("logs into an existing Apple account", async () => {
    mockPrisma.account.findUnique.mockResolvedValue(appleAccount);

    const result = await signInWithApple(baseParams);

    expect(mockVerifyToken).toHaveBeenCalledWith(
      expect.objectContaining({
        idToken: baseParams.identityToken,
        nonce: baseParams.nonce,
        audiences: ["com.example.web", "top.hapaul.Yulai"],
      }),
    );
    expect(mockPrisma.account.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: appleAccount.id } }),
    );
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(result.user).toBe(appleAccount.user);
    expect(result.session).toBe(session);
  });

  it("registers a new user keyed by the Apple sub without an email", async () => {
    mockPrisma.account.findUnique.mockResolvedValue(null);
    const created = { id: "user_new", name: "John Apple" };
    mockPrisma.user.create.mockResolvedValue(created);

    const result = await signInWithApple({
      ...baseParams,
      user: { firstName: "John", lastName: "Apple" },
    });

    expect(mockPrisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "John Apple",
        emailVerified: false,
        accounts: {
          create: expect.objectContaining({
            providerId: "apple",
            accountId: token.sub,
            providerData: {
              sub: token.sub,
              email: token.email,
              emailVerified: token.emailVerified,
              isPrivateEmail: token.isPrivateEmail,
            },
          }),
        },
      }),
    });
    expect(mockPrisma.user.create.mock.calls[0]?.[0].data).not.toHaveProperty(
      "email",
    );
    expect(mockSubscribe).toHaveBeenCalledWith("user_new");
    expect(result.user).toBe(created);
  });

  it("falls back to a random name when no profile name is given", async () => {
    mockPrisma.account.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({ id: "user_new", name: "x" });

    await signInWithApple(baseParams);

    const call = mockPrisma.user.create.mock.calls[0]?.[0].data as Record<
      string,
      unknown
    >;
    expect(call.name).toMatch(/^apple_[0-9a-f]{8}$/);
    expect(call.emailVerified).toBe(false);
    expect(call).not.toHaveProperty("email");
  });

  it("logs in when a concurrent request created the account (P2002)", async () => {
    mockPrisma.account.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(appleAccount);
    const p2002 = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
    });
    mockPrisma.user.create.mockRejectedValueOnce(p2002);

    const result = await signInWithApple(baseParams);

    expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.account.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: appleAccount.id } }),
    );
    expect(result.user).toBe(appleAccount.user);
    expect(result.session).toBe(session);
  });

  it("throws 403 when registration is disabled and no account exists", async () => {
    mockFindByGroup.mockImplementation(async (group: string) => {
      if (group === "auth") {
        return configRows("auth", { "registration.enabled": "false" });
      }
      return configRows("apple", { clientId: "com.example.web" });
    });
    mockPrisma.account.findUnique.mockResolvedValue(null);

    await expectStatus(() => signInWithApple(baseParams), 403);
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });
});
