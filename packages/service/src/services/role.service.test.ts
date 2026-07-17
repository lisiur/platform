import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/db", () => ({
  prisma: {
    $transaction: vi.fn(),
    roleAssignment: { deleteMany: vi.fn() },
    role: { delete: vi.fn() },
  },
}));

vi.mock("#repositories/role.repository", () => ({
  roleRepository: {
    findById: vi.fn(),
    findByAppAndCode: vi.fn(),
    findByAppId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { prisma } from "#lib/db";
import { roleRepository } from "#repositories/role.repository";
import { deleteRole, updateRole } from "./role.service";

const mockRepo = roleRepository as unknown as {
  findById: ReturnType<typeof vi.fn>;
  findByAppAndCode: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

const mockPrisma = prisma as unknown as {
  $transaction: ReturnType<typeof vi.fn>;
  roleAssignment: { deleteMany: ReturnType<typeof vi.fn> };
  role: { delete: ReturnType<typeof vi.fn> };
};

const builtinRole = {
  id: "r-builtin",
  appId: "app-admin",
  scopeType: "PLATFORM",
  scopeId: "",
  name: "Administrator",
  code: "admin",
  flags: ["builtin"],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const customRole = {
  id: "r-custom",
  appId: "app-admin",
  scopeType: "PLATFORM",
  scopeId: "",
  name: "Editor",
  code: "editor",
  flags: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

async function expectStatus(
  fn: () => Promise<unknown>,
  status: number,
): Promise<void> {
  const err = await fn().catch((e) => e);
  expect(err).toBeInstanceOf(HTTPException);
  expect((err as HTTPException).status).toBe(status);
}

describe("updateRole", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects a code change on a built-in role (400)", async () => {
    mockRepo.findById.mockResolvedValue(builtinRole);
    await expectStatus(
      () => updateRole("r-builtin", { code: "superuser" }),
      400,
    );
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it("rejects a flags change on a built-in role (400)", async () => {
    mockRepo.findById.mockResolvedValue(builtinRole);
    await expectStatus(() => updateRole("r-builtin", { flags: [] }), 400);
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it("allows a name-only edit on a built-in role", async () => {
    mockRepo.findById.mockResolvedValue(builtinRole);
    mockRepo.update.mockResolvedValue({ ...builtinRole, name: "Admin" });
    const updated = await updateRole("r-builtin", { name: "Admin" });
    expect(mockRepo.update).toHaveBeenCalledWith("r-builtin", {
      name: "Admin",
    });
    expect(updated.name).toBe("Admin");
  });

  it("allows code/flags changes on a non-built-in role", async () => {
    mockRepo.findById.mockResolvedValue(customRole);
    mockRepo.findByAppAndCode.mockResolvedValue(null);
    mockRepo.update.mockResolvedValue({ ...customRole, code: "editor-v2" });
    await updateRole("r-custom", { code: "editor-v2", flags: ["x"] });
    expect(mockRepo.update).toHaveBeenCalledWith("r-custom", {
      code: "editor-v2",
      flags: ["x"],
    });
  });

  it("returns 404 when the role does not exist", async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expectStatus(() => updateRole("missing", { name: "x" }), 404);
  });
});

describe("deleteRole", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects deletion of a built-in role (400)", async () => {
    mockRepo.findById.mockResolvedValue(builtinRole);
    await expectStatus(() => deleteRole("r-builtin"), 400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.roleAssignment.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.role.delete).not.toHaveBeenCalled();
  });

  it("deletes a non-built-in role and its assignments", async () => {
    mockRepo.findById.mockResolvedValue(customRole);
    mockPrisma.$transaction.mockResolvedValue([]);
    const result = await deleteRole("r-custom");
    expect(result).toEqual({ name: "Editor" });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.roleAssignment.deleteMany).toHaveBeenCalledWith({
      where: { roleId: "r-custom" },
    });
    expect(mockPrisma.role.delete).toHaveBeenCalledWith({
      where: { id: "r-custom" },
    });
  });

  it("returns 404 when the role does not exist", async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expectStatus(() => deleteRole("missing"), 404);
  });
});
