import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";

export async function listMembers(
  organizationId: string,
  params: {
    limit: number;
    offset: number;
    departmentId?: string | null;
  },
) {
  const { limit, offset, departmentId } = params;

  const where = {
    organizationId,
    ...(departmentId !== undefined && { departmentId }),
  };

  const [rows, total] = await Promise.all([
    prisma.member.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        department: { select: { id: true, name: true } },
        memberPositions: {
          include: {
            position: { select: { id: true, name: true, code: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: limit,
      skip: offset,
    }),
    prisma.member.count({ where }),
  ]);
  const members = rows.map(({ memberPositions, ...member }) => ({
    ...member,
    positions: memberPositions.map((mp) => mp.position),
  }));
  return { members, total };
}

export async function removeMember(organizationId: string, memberId: string) {
  const member = await prisma.member.findFirst({
    where: { id: memberId, organizationId },
  });
  if (!member) {
    throw new Error("Member not found");
  }

  // Check if this is the last owner
  if (member.role === "owner") {
    const ownerCount = await prisma.member.count({
      where: { organizationId, role: "owner" },
    });
    if (ownerCount <= 1) {
      throw new Error("Cannot remove the last owner");
    }
  }

  return prisma.member.delete({ where: { id: memberId } });
}

export async function updateMember(
  organizationId: string,
  memberId: string,
  data: { departmentId: string | null },
) {
  const member = await prisma.member.findFirst({
    where: { id: memberId, organizationId },
  });
  if (!member) {
    throw new Error("Member not found");
  }

  if (data.departmentId) {
    const department = await prisma.department.findFirst({
      where: { id: data.departmentId, organizationId },
    });
    if (!department) {
      throw new Error("Department not found");
    }
  }

  return prisma.member.update({
    where: { id: memberId },
    data: { departmentId: data.departmentId },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      department: { select: { id: true, name: true } },
    },
  });
}

export async function batchUpdateMembers(
  organizationId: string,
  memberIds: string[],
  data: { departmentId: string | null },
) {
  const members = await prisma.member.findMany({
    where: { id: { in: memberIds }, organizationId },
  });
  if (members.length !== memberIds.length) {
    throw new HTTPException(400, { message: "One or more members not found" });
  }

  if (data.departmentId) {
    const department = await prisma.department.findFirst({
      where: { id: data.departmentId, organizationId },
    });
    if (!department) {
      throw new HTTPException(400, { message: "Department not found" });
    }
  }

  return prisma.member.updateMany({
    where: { id: { in: memberIds } },
    data: { departmentId: data.departmentId },
  });
}
