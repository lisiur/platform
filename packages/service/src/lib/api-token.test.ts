import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/db", () => ({
  prisma: {
    apiToken: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    permission: {
      findMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue(null),
    },
  },
}));

import { getApiTokenByBearer } from "#lib/api-token";
import { prisma } from "#lib/db";
import { assertAccess } from "#services/role-permission.service";

const mockPrisma = prisma as unknown as {
  apiToken: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  permission: {
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
  scopes: ["member::read"],
  organizationId: null,
  appId: null,
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
    expect(result?.scopes).toEqual(["member::read"]);
  });
});

describe("assertAccess (token principal)", () => {
  beforeEach(() => vi.resetAllMocks());

  const tokenPrincipal = {
    kind: "token" as const,
    token: validTokenRow,
    scopes: ["member::read"],
    ownerId: "user_1",
    ownerName: "User One",
  };

  it("passes when scope matches and owner holds the permission", async () => {
    mockPrisma.permission.findMany.mockResolvedValue([
      { code: "member::read" },
    ]);

    await expect(
      assertAccess(tokenPrincipal, "member::read"),
    ).resolves.toBeUndefined();
  });

  it("throws 403 when scope does not match", async () => {
    await expect(
      assertAccess(tokenPrincipal, "user::delete"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("throws 403 when owner no longer holds the permission", async () => {
    mockPrisma.permission.findMany.mockResolvedValue([]);

    await expect(
      assertAccess(tokenPrincipal, "member::read"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("throws 403 on binding mismatch", async () => {
    const bound = {
      ...tokenPrincipal,
      token: { ...validTokenRow, organizationId: "org_a" },
    };
    mockPrisma.permission.findMany.mockResolvedValue([
      { code: "member::read" },
    ]);

    await expect(
      assertAccess(bound, "member::read", { organizationId: "org_b" }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
