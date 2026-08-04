import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/db", () => ({
  prisma: {
    role: { findUnique: vi.fn() },
    roleAssignment: { upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "#lib/db";
import { userRoleRepository } from "./user-role.repository";

const db = prisma as unknown as {
  role: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  roleAssignment: {
    upsert: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

describe("userRoleRepository.assign", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.$transaction.mockImplementation(
      async (cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma),
    );
    db.roleAssignment.upsert.mockResolvedValue({
      id: "ra1",
      userId: "user1",
      roleId: "role1",
    });
  });

  it("assigns a role to a user", async () => {
    db.role.findUnique.mockResolvedValue({ id: "role1" });

    await userRoleRepository.assign("user1", "role1");

    expect(db.roleAssignment.upsert).toHaveBeenCalledWith({
      where: {
        userId_roleId: {
          userId: "user1",
          roleId: "role1",
        },
      },
      update: {},
      create: { userId: "user1", roleId: "role1" },
      include: { role: true },
    });
  });

  it("throws 404 when the role does not exist", async () => {
    db.role.findUnique.mockResolvedValue(null);

    await expect(userRoleRepository.assign("user1", "missing")).rejects.toThrow(
      "Role not found",
    );

    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.roleAssignment.upsert).not.toHaveBeenCalled();
  });
});
