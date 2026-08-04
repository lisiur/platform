import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/db", () => ({
  prisma: {
    apiToken: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("#lib/api-token", () => ({
  generateApiTokenString: vi.fn(() => "plat_testtoken"),
  hashApiToken: vi.fn((t: string) => `hash_${t}`),
  tokenPrefixOf: vi.fn(() => "plat_tes"),
  tokenSuffixOf: vi.fn(() => "tEsT"),
}));

vi.mock("#modules/access-control/public", () => ({
  getAllUserPermissionCodes: vi.fn(),
}));

import { prisma } from "#lib/db";
import { getAllUserPermissionCodes } from "#modules/access-control/public";
import {
  createApiTokenForUser,
  deleteApiTokenForUser,
  listApiTokensForUser,
  updateApiTokenForUser,
} from "./api-token.service";

const mockPrisma = prisma as unknown as {
  apiToken: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
};

const baseRecord = {
  id: "tok_1",
  tokenHash: "hash_plat_testtoken",
  tokenPrefix: "plat_tes",
  tokenSuffix: "tEsT",
  name: "CI",
  ownerId: "user_1",
  scopes: ["member::read"],
  scope: null,
  enabled: true,
  expiresAt: null,
  lastUsedAt: null,
  lastUsedIp: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("createApiTokenForUser", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates a token when scopes are within owner permissions", async () => {
    vi.mocked(getAllUserPermissionCodes).mockResolvedValue([
      "member::read",
      "department::read",
    ]);
    mockPrisma.apiToken.create.mockResolvedValue(baseRecord);

    const result = await createApiTokenForUser({
      ownerId: "user_1",
      name: "CI",
      scopes: ["member::read"],
    });

    expect(result.token).toBe("plat_testtoken");
    expect(result.record).not.toHaveProperty("tokenHash");
    expect(mockPrisma.apiToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tokenHash: "hash_plat_testtoken",
          ownerId: "user_1",
          scopes: ["member::read"],
        }),
      }),
    );
  });

  it("rejects scopes exceeding owner permissions", async () => {
    vi.mocked(getAllUserPermissionCodes).mockResolvedValue(["member::read"]);

    await expect(
      createApiTokenForUser({
        ownerId: "user_1",
        name: "CI",
        scopes: ["member::read", "user::delete"],
      }),
    ).rejects.toMatchObject({ status: 403 });

    expect(mockPrisma.apiToken.create).not.toHaveBeenCalled();
  });
});

describe("listApiTokensForUser", () => {
  beforeEach(() => vi.resetAllMocks());

  it("filters by owner and strips tokenHash", async () => {
    mockPrisma.apiToken.findMany.mockResolvedValue([baseRecord]);

    const result = await listApiTokensForUser("user_1");

    expect(mockPrisma.apiToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: "user_1" } }),
    );
    expect(result[0]).not.toHaveProperty("tokenHash");
  });
});

describe("updateApiTokenForUser", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 404 when token is not owned by the user", async () => {
    mockPrisma.apiToken.findFirst.mockResolvedValue(null);

    await expect(
      updateApiTokenForUser("user_1", "tok_x", { enabled: false }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("revalidates scopes on update", async () => {
    mockPrisma.apiToken.findFirst.mockResolvedValue(baseRecord);
    vi.mocked(getAllUserPermissionCodes).mockResolvedValue(["member::read"]);
    mockPrisma.apiToken.update.mockResolvedValue(baseRecord);

    await updateApiTokenForUser("user_1", "tok_1", {
      scopes: ["member::read"],
    });

    expect(getAllUserPermissionCodes).toHaveBeenCalledWith("user_1", "system");
  });

  it("rejects out-of-scope update", async () => {
    mockPrisma.apiToken.findFirst.mockResolvedValue(baseRecord);
    vi.mocked(getAllUserPermissionCodes).mockResolvedValue(["member::read"]);

    await expect(
      updateApiTokenForUser("user_1", "tok_1", { scopes: ["user::delete"] }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("deleteApiTokenForUser", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 404 when token is not owned by the user", async () => {
    mockPrisma.apiToken.findFirst.mockResolvedValue(null);

    await expect(
      deleteApiTokenForUser("user_1", "tok_x"),
    ).rejects.toMatchObject({ status: 404 });
    expect(mockPrisma.apiToken.delete).not.toHaveBeenCalled();
  });

  it("deletes when owned", async () => {
    mockPrisma.apiToken.findFirst.mockResolvedValue(baseRecord);

    await deleteApiTokenForUser("user_1", "tok_1");

    expect(mockPrisma.apiToken.delete).toHaveBeenCalledWith({
      where: { id: "tok_1" },
    });
  });
});
