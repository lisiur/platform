import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/db", () => ({
  prisma: {
    session: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "#lib/db";
import { getSessionByToken, isUserBanned } from "#lib/session";

const mockPrisma = prisma as unknown as {
  session: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

const futureDate = () => new Date(Date.now() + 60 * 60 * 24 * 1000);
const pastDate = () => new Date(Date.now() - 60 * 60 * 24 * 1000);

function buildRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "sess_1",
    token: "abc",
    expiresAt: futureDate(),
    ipAddress: null,
    userAgent: null,
    userId: "user_1",
    activeOrganizationId: null,
    revokedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: {
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
    },
    ...overrides,
  };
}

describe("isUserBanned", () => {
  it("returns false when not banned", () => {
    expect(isUserBanned({ banned: false, banExpires: null })).toBe(false);
  });

  it("returns true when banned with no expiry", () => {
    expect(isUserBanned({ banned: true, banExpires: null })).toBe(true);
  });

  it("returns true when banned with future expiry", () => {
    expect(isUserBanned({ banned: true, banExpires: futureDate() })).toBe(true);
  });

  it("returns false when banned but expiry has passed", () => {
    expect(isUserBanned({ banned: true, banExpires: pastDate() })).toBe(false);
  });
});

describe("getSessionByToken", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns null when no token provided", async () => {
    await expect(getSessionByToken(null)).resolves.toBeNull();
    expect(mockPrisma.session.findUnique).not.toHaveBeenCalled();
  });

  it("returns null when session not found", async () => {
    mockPrisma.session.findUnique.mockResolvedValue(null);
    await expect(getSessionByToken("abc")).resolves.toBeNull();
  });

  it("returns null when session is revoked", async () => {
    mockPrisma.session.findUnique.mockResolvedValue(
      buildRow({ revokedAt: pastDate() }),
    );
    await expect(getSessionByToken("abc")).resolves.toBeNull();
    expect(mockPrisma.session.update).not.toHaveBeenCalled();
  });

  it("returns null and revokes when session is expired", async () => {
    mockPrisma.session.findUnique.mockResolvedValue(
      buildRow({ expiresAt: pastDate() }),
    );
    mockPrisma.session.update.mockResolvedValue({});

    await expect(getSessionByToken("abc")).resolves.toBeNull();
    expect(mockPrisma.session.update).toHaveBeenCalledWith({
      where: { id: "sess_1" },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("returns null and revokes when user is banned with active ban", async () => {
    mockPrisma.session.findUnique.mockResolvedValue(
      buildRow({
        user: { banned: true, banExpires: null },
      }),
    );
    mockPrisma.session.update.mockResolvedValue({});

    await expect(getSessionByToken("abc")).resolves.toBeNull();
    expect(mockPrisma.session.update).toHaveBeenCalledWith({
      where: { id: "sess_1" },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("returns null and revokes when user is banned with future ban expiry", async () => {
    mockPrisma.session.findUnique.mockResolvedValue(
      buildRow({
        user: { banned: true, banExpires: futureDate() },
      }),
    );
    mockPrisma.session.update.mockResolvedValue({});

    await expect(getSessionByToken("abc")).resolves.toBeNull();
    expect(mockPrisma.session.update).toHaveBeenCalledTimes(1);
  });

  it("returns session when ban has expired", async () => {
    mockPrisma.session.findUnique.mockResolvedValue(
      buildRow({
        user: { banned: true, banExpires: pastDate() },
      }),
    );

    const result = await getSessionByToken("abc");
    expect(result).not.toBeNull();
    expect(mockPrisma.session.update).not.toHaveBeenCalled();
  });

  it("returns session for a valid, non-banned user", async () => {
    const row = buildRow();
    mockPrisma.session.findUnique.mockResolvedValue(row);

    const result = await getSessionByToken("abc");
    expect(result).toBe(row);
    expect(mockPrisma.session.update).not.toHaveBeenCalled();
  });
});
