import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/db", () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    role: {
      deleteMany: vi.fn(),
    },
    roleAssignment: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "#lib/db";
import { deleteOrganization } from "./organization.service";

const mockPrisma = prisma as unknown as {
  organization: {
    findUnique: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  role: { deleteMany: ReturnType<typeof vi.fn> };
  roleAssignment: { deleteMany: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

const fakeOrg = {
  id: "org_1",
  name: "Acme",
  slug: "acme",
  logo: null,
  createdAt: new Date(),
};

describe("deleteOrganization", () => {
  beforeEach(() => vi.resetAllMocks());

  it("throws 404 when the organization does not exist", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue(null);

    await expect(deleteOrganization("org_missing")).rejects.toMatchObject({
      status: 404,
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("sweeps org-scoped RoleAssignments and Roles, then deletes the org, in one transaction", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue(fakeOrg);
    mockPrisma.roleAssignment.deleteMany.mockResolvedValue("ra_op");
    mockPrisma.role.deleteMany.mockResolvedValue("role_op");
    mockPrisma.organization.delete.mockResolvedValue("org_op");
    mockPrisma.$transaction.mockResolvedValue([
      { count: 3 },
      { count: 1 },
      fakeOrg,
    ]);

    const result = await deleteOrganization("org_1");

    expect(mockPrisma.roleAssignment.deleteMany).toHaveBeenCalledWith({
      where: { role: { code: { startsWith: "org:org_1/" } } },
    });
    expect(mockPrisma.role.deleteMany).toHaveBeenCalledWith({
      where: { code: { startsWith: "org:org_1/" } },
    });
    expect(mockPrisma.organization.delete).toHaveBeenCalledWith({
      where: { id: "org_1" },
    });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);

    const txArg = mockPrisma.$transaction.mock.calls[0][0];
    expect(Array.isArray(txArg)).toBe(true);
    expect(txArg).toHaveLength(3);

    // Operations must be constructed in this order so assignments (which may
    // reference platform-scoped roles) are cleared before org-scoped roles.
    const callOrder = [
      mockPrisma.roleAssignment.deleteMany.mock.invocationCallOrder[0],
      mockPrisma.role.deleteMany.mock.invocationCallOrder[0],
      mockPrisma.organization.delete.mock.invocationCallOrder[0],
    ];
    expect(callOrder[0]).toBeLessThan(callOrder[1]);
    expect(callOrder[1]).toBeLessThan(callOrder[2]);

    expect(result).toEqual({ ...fakeOrg, name: "Acme" });
  });
});
