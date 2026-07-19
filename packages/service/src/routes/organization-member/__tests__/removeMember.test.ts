import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/db", () => ({
  prisma: {
    member: { findFirst: vi.fn(), delete: vi.fn() },
    roleAssignment: { count: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "#lib/db";
import { removeMember } from "#services/member.service";

const db = prisma as unknown as {
  member: {
    findFirst: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  roleAssignment: {
    count: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

describe("removeMember", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Interactive $transaction: invoke the callback with `prisma` as `tx`
    db.$transaction.mockImplementation(
      async (cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma),
    );
    db.member.delete.mockResolvedValue({ id: "member1" });
  });

  it("deletes a non-owner member inside a transaction", async () => {
    db.member.findFirst.mockResolvedValue({ id: "member1", userId: "user1" });
    db.roleAssignment.count.mockResolvedValue(0); // not an owner

    await removeMember("org1", "member1");

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.roleAssignment.count).toHaveBeenCalledWith({
      where: {
        userId: "user1",
        role: { code: "owner", appId: "organization" },
        scope: "org:org1",
      },
    });
    expect(db.member.delete).toHaveBeenCalledWith({
      where: { id: "member1" },
    });
  });

  it("throws when removing an owner", async () => {
    db.member.findFirst.mockResolvedValue({ id: "member1", userId: "user1" });
    db.roleAssignment.count.mockResolvedValue(1); // is an owner

    await expect(removeMember("org1", "member1")).rejects.toThrow(
      "Cannot remove an owner",
    );

    expect(db.member.delete).not.toHaveBeenCalled();
  });

  it("throws when the member is not found", async () => {
    db.member.findFirst.mockResolvedValue(null);

    await expect(removeMember("org1", "missing")).rejects.toThrow(
      "Member not found",
    );

    expect(db.roleAssignment.count).not.toHaveBeenCalled();
    expect(db.member.delete).not.toHaveBeenCalled();
  });
});
