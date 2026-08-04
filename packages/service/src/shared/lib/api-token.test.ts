import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/db", () => ({
  prisma: {
    apiToken: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    roleAssignment: {
      findMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue(null),
    },
  },
}));

import { getApiTokenByBearer } from "#lib/api-token";
import { prisma } from "#lib/db";
import { assertAccess } from "#modules/access-control/public";

const mockPrisma = prisma as unknown as {
  apiToken: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  roleAssignment: {
    findMany: ReturnType<typeof vi.fn>;
  };
  auditLog: {
    create: ReturnType<typeof vi.fn>;
  };
};

const validOwner = {
  id: "user_1",
  name: "User One",
  banned: false,
  banExpires: null,
};
const validTokenRow = {
  id: "tok_1",
  tokenHash: expect.any(String),
  tokenPrefix: "plat_tes",
  tokenSuffix: "tEsT",
  name: "CI",
  ownerId: "user_1",
  scopes: ["system/member:read"],
  scope: null,
  enabled: true,
  expiresAt: null,
  lastUsedAt: null,
  lastUsedIp: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("getApiTokenByBearer", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns null when no token provided", async () => {
    await expect(getApiTokenByBearer(null)).resolves.toBeNull();
  });

  it("returns null for disabled token", async () => {
    mockPrisma.apiToken.findUnique.mockResolvedValue({
      ...validTokenRow,
      enabled: false,
      owner: validOwner,
    });
    await expect(getApiTokenByBearer("plat_x")).resolves.toBeNull();
  });

  it("returns null for expired token", async () => {
    mockPrisma.apiToken.findUnique.mockResolvedValue({
      ...validTokenRow,
      expiresAt: new Date(Date.now() - 1000),
      owner: validOwner,
    });
    await expect(getApiTokenByBearer("plat_x")).resolves.toBeNull();
  });

  it("returns null when owner is banned", async () => {
    mockPrisma.apiToken.findUnique.mockResolvedValue({
      ...validTokenRow,
      owner: { ...validOwner, banned: true, banExpires: null },
    });
    await expect(getApiTokenByBearer("plat_x")).resolves.toBeNull();
  });

  it("returns principal for a valid token", async () => {
    mockPrisma.apiToken.findUnique.mockResolvedValue({
      ...validTokenRow,
      owner: validOwner,
    });
    mockPrisma.apiToken.update.mockResolvedValue({});

    const result = await getApiTokenByBearer("plat_x");
    expect(result).not.toBeNull();
    expect(result?.ownerId).toBe("user_1");
    expect(result?.scopes).toEqual(["system/member:read"]);
  });
});

describe("assertAccess (token principal)", () => {
  beforeEach(() => vi.resetAllMocks());

  const tokenPrincipal = {
    kind: "token" as const,
    token: validTokenRow,
    scopes: ["system/member:read"],
    ownerId: "user_1",
    ownerName: "User One",
  };

  it("passes when scope matches and owner holds the permission", async () => {
    mockPrisma.roleAssignment.findMany.mockResolvedValue([
      {
        role: {
          code: "system/admin",
          rolePermissions: [{ permission: { code: "system/member:read" } }],
        },
      },
    ]);

    await expect(
      assertAccess(tokenPrincipal, "system/member:read"),
    ).resolves.toBeUndefined();
  });

  it("throws 403 when scope does not match", async () => {
    await expect(
      assertAccess(tokenPrincipal, "system/user:delete"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("throws 403 when owner no longer holds the permission", async () => {
    mockPrisma.roleAssignment.findMany.mockResolvedValue([]);

    await expect(
      assertAccess(tokenPrincipal, "system/member:read"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("throws 403 on binding mismatch", async () => {
    const bound = {
      ...tokenPrincipal,
      token: { ...validTokenRow, scope: "org:a" },
    };

    await expect(
      assertAccess(bound, "org/member:read", "org:b"),
    ).rejects.toMatchObject({ status: 403 });
  });
});
