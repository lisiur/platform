import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";

export async function listDepartments(organizationId: string) {
  return prisma.department.findMany({
    where: { organizationId },
    include: { _count: { select: { children: true } } },
    orderBy: { name: "asc" },
  });
}

export async function getDepartment(organizationId: string, id: string) {
  const department = await prisma.department.findFirst({
    where: { id, organizationId },
    include: { _count: { select: { children: true } } },
  });
  if (!department) {
    throw new HTTPException(404, { message: "Department not found" });
  }
  return department;
}

export async function createDepartment(
  organizationId: string,
  data: {
    name: string;
    code: string;
    parentId?: string | null;
    description?: string;
  },
) {
  const existing = await prisma.department.findUnique({
    where: { organizationId_code: { organizationId, code: data.code } },
  });
  if (existing) {
    throw new HTTPException(409, {
      message: "Code already taken in this organization",
    });
  }

  if (data.parentId) {
    const parent = await prisma.department.findFirst({
      where: { id: data.parentId, organizationId },
    });
    if (!parent) {
      throw new HTTPException(400, { message: "Parent department not found" });
    }
  }

  return prisma.department.create({
    data: {
      organizationId,
      name: data.name,
      code: data.code,
      parentId: data.parentId ?? null,
      description: data.description ?? null,
    },
    include: { _count: { select: { children: true } } },
  });
}

export async function updateDepartment(
  organizationId: string,
  id: string,
  data: {
    name?: string;
    code?: string;
    parentId?: string | null;
    description?: string | null;
  },
) {
  const department = await prisma.department.findFirst({
    where: { id, organizationId },
  });
  if (!department) {
    throw new HTTPException(404, { message: "Department not found" });
  }

  if (data.code && data.code !== department.code) {
    const existing = await prisma.department.findUnique({
      where: { organizationId_code: { organizationId, code: data.code } },
    });
    if (existing) {
      throw new HTTPException(409, {
        message: "Code already taken in this organization",
      });
    }
  }

  if (data.parentId !== undefined) {
    if (data.parentId === id) {
      throw new HTTPException(400, {
        message: "Department cannot be its own parent",
      });
    }
    if (data.parentId) {
      const parent = await prisma.department.findFirst({
        where: { id: data.parentId, organizationId },
      });
      if (!parent) {
        throw new HTTPException(400, {
          message: "Parent department not found",
        });
      }
    }
  }

  return prisma.department.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.code !== undefined && { code: data.code }),
      ...(data.parentId !== undefined && { parentId: data.parentId }),
      ...(data.description !== undefined && { description: data.description }),
    },
    include: { _count: { select: { children: true } } },
  });
}

export async function deleteDepartment(organizationId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const department = await tx.department.findFirst({
      where: { id, organizationId },
    });
    if (!department) {
      throw new HTTPException(404, { message: "Department not found" });
    }

    // Reparent children to deleted department's parent
    await tx.department.updateMany({
      where: { parentId: id },
      data: { parentId: department.parentId },
    });

    // Unassign members from this department
    await tx.member.updateMany({
      where: { departmentId: id },
      data: { departmentId: null },
    });

    return tx.department.delete({ where: { id } });
  });
}
