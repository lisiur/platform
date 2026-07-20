import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    member: { findMany: vi.fn() },
  },
}));

vi.mock("#lib/logger", () => ({
  logAudit: vi.fn(),
}));

vi.mock("#lib/password", () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock("#lib/session", () => ({
  createSession: vi.fn(),
  deleteSessionByToken: vi.fn(),
  getSessionFromHeaders: vi.fn(),
}));

vi.mock("#lib/wechat", () => ({
  code2Session: vi.fn(),
}));

vi.mock("#repositories/system-config.repository", () => ({
  systemConfigRepository: { findByGroupAndKey: vi.fn() },
}));

vi.mock("#services/notification/notification.service", () => ({
  createNotificationsFromTemplate: vi.fn(),
}));

vi.mock("#states", () => ({
  eventBus: { close: vi.fn() },
}));

import { prisma } from "#lib/db";
import { logAudit } from "#lib/logger";
import { verifyPassword } from "#lib/password";
import { createSession } from "#lib/session";
import { signInWithEmail } from "./auth.service";

const mockPrisma = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> };
  member: { findMany: ReturnType<typeof vi.fn> };
};
const mockLogAudit = logAudit as unknown as ReturnType<typeof vi.fn>;
const mockVerifyPassword = verifyPassword as unknown as ReturnType<
  typeof vi.fn
>;
const mockCreateSession = createSession as unknown as ReturnType<typeof vi.fn>;

const credentialAccount = {
  id: "acct_1",
  providerId: "credential",
  accountId: "jane@example.com",
  password: "hashed:secret",
  userId: "user_1",
};

const existingUser = {
  id: "user_1",
  name: "Jane",
  email: "jane@example.com",
  emailVerified: true,
  image: null,
  banned: false,
  banReason: null,
  banExpires: null,
  flags: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  accounts: [credentialAccount],
};

const baseParams = {
  email: "Jane@Example.com",
  password: "p@ssw0rd",
  ipAddress: "203.0.113.10",
  traceId: "trace-abc",
  userAgent: "vitest/1.0",
};

async function expectStatus(
  fn: () => Promise<unknown>,
  status: number,
): Promise<void> {
  const err = await fn().catch((e) => e);
  expect(err).toBeInstanceOf(HTTPException);
  expect((err as HTTPException).status).toBe(status);
}

describe("signInWithEmail — failed-login audit", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("emits auth.login_failed with reason=unknown_user when the user does not exist", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expectStatus(() => signInWithEmail(baseParams), 401);

    expect(mockVerifyPassword).not.toHaveBeenCalled();
    expect(mockLogAudit).toHaveBeenCalledTimes(1);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "auth.login_failed",
        category: "authentication",
        outcome: "failure",
        severity: "warning",
        userId: undefined,
        traceId: baseParams.traceId,
        metadata: expect.objectContaining({
          email: baseParams.email,
          ipAddress: baseParams.ipAddress,
          userAgent: baseParams.userAgent,
          reason: "unknown_user",
        }),
      }),
    );
  });

  it("emits auth.login_failed with reason=no_credential when the user has no credential account", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      ...existingUser,
      accounts: [],
    });

    await expectStatus(() => signInWithEmail(baseParams), 401);

    expect(mockVerifyPassword).not.toHaveBeenCalled();
    expect(mockLogAudit).toHaveBeenCalledTimes(1);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "auth.login_failed",
        outcome: "failure",
        userId: existingUser.id,
        userName: existingUser.name,
        metadata: expect.objectContaining({ reason: "no_credential" }),
      }),
    );
  });

  it("emits auth.login_failed with reason=wrong_password when the password is wrong", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(existingUser);
    mockVerifyPassword.mockResolvedValue(false);

    await expectStatus(() => signInWithEmail(baseParams), 401);

    expect(mockVerifyPassword).toHaveBeenCalledTimes(1);
    expect(mockLogAudit).toHaveBeenCalledTimes(1);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "auth.login_failed",
        outcome: "failure",
        userId: existingUser.id,
        userName: existingUser.name,
        metadata: expect.objectContaining({ reason: "wrong_password" }),
      }),
    );
  });

  it("does not emit auth.login_failed on a successful sign-in (emits auth.login instead)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(existingUser);
    mockVerifyPassword.mockResolvedValue(true);
    mockPrisma.member.findMany.mockResolvedValue([]);
    mockCreateSession.mockResolvedValue({
      id: "sess_1",
      token: "tok_1",
      userId: existingUser.id,
      ipAddress: baseParams.ipAddress,
      userAgent: baseParams.userAgent,
    });

    await signInWithEmail(baseParams);

    const calls = (mockLogAudit.mock.calls as Array<[{ event: string }]>).map(
      (c) => c[0],
    );
    expect(calls.some((c) => c.event === "auth.login_failed")).toBe(false);
    expect(calls.some((c) => c.event === "auth.login")).toBe(true);
  });
});
