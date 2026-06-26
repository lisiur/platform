import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";

export async function listPositions(organizationId: string) {
  return prisma.position.findMany({
    where: { organizationId },
    include: { _count: { select: { memberPositions: true } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function listPositionMembers(
  organizationId: string,
  positionId: string,
) {
  const position = await prisma.position.findFirst({
    where: { id: positionId, organizationId },
  });
  if (!position) {
    throw new HTTPException(404, { message: "Position not found" });
  }

  const memberPositions = await prisma.memberPosition.findMany({
    where: { positionId },
    include: {
      member: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
          memberPositions: {
            include: {
              position: { select: { id: true, name: true, code: true } },
            },
          },
        },
      },
    },
  });

  return memberPositions.map((mp) => ({
    ...mp.member,
    positions: mp.member.memberPositions.map((mp2) => mp2.position),
  }));
}

export async function getPosition(organizationId: string, id: string) {
  const position = await prisma.position.findFirst({
    where: { id, organizationId },
  });
  if (!position) {
    throw new HTTPException(404, { message: "Position not found" });
  }
  return position;
}

export async function createPosition(
  organizationId: string,
  data: {
    name: string;
    code: string;
    description?: string;
    sortOrder?: number;
  },
) {
  const existing = await prisma.position.findUnique({
    where: { organizationId_code: { organizationId, code: data.code } },
  });
  if (existing) {
    throw new HTTPException(409, {
      message: "Code already taken in this organization",
    });
  }

  return prisma.position.create({
    data: {
      organizationId,
      name: data.name,
      code: data.code,
      description: data.description ?? null,
      sortOrder: data.sortOrder ?? 0,
    },
  });
}

export async function updatePosition(
  organizationId: string,
  id: string,
  data: {
    name?: string;
    code?: string;
    description?: string | null;
    sortOrder?: number;
  },
) {
  const position = await prisma.position.findFirst({
    where: { id, organizationId },
  });
  if (!position) {
    throw new HTTPException(404, { message: "Position not found" });
  }

  if (data.code && data.code !== position.code) {
    const existing = await prisma.position.findUnique({
      where: { organizationId_code: { organizationId, code: data.code } },
    });
    if (existing) {
      throw new HTTPException(409, {
        message: "Code already taken in this organization",
      });
    }
  }

  return prisma.position.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.code !== undefined && { code: data.code }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
    },
  });
}

export async function deletePosition(organizationId: string, id: string) {
  const position = await prisma.position.findFirst({
    where: { id, organizationId },
  });
  if (!position) {
    throw new HTTPException(404, { message: "Position not found" });
  }

  return prisma.position.delete({ where: { id } });
}

export async function setMemberPositions(
  organizationId: string,
  memberId: string,
  positionIds: string[],
) {
  const member = await prisma.member.findFirst({
    where: { id: memberId, organizationId },
  });
  if (!member) {
    throw new HTTPException(404, { message: "Member not found" });
  }

  if (positionIds.length > 0) {
    const positions = await prisma.position.findMany({
      where: { id: { in: positionIds }, organizationId },
    });
    if (positions.length !== positionIds.length) {
      throw new HTTPException(400, {
        message: "One or more positions not found",
      });
    }
  }

  return prisma.$transaction(async (tx) => {
    await tx.memberPosition.deleteMany({ where: { memberId } });
    if (positionIds.length > 0) {
      await tx.memberPosition.createMany({
        data: positionIds.map((positionId) => ({ memberId, positionId })),
      });
    }
    return tx.memberPosition.findMany({
      where: { memberId },
      include: { position: true },
    });
  });
}

export async function batchSetMemberPositions(
  organizationId: string,
  memberIds: string[],
  positionIds: string[],
) {
  const members = await prisma.member.findMany({
    where: { id: { in: memberIds }, organizationId },
  });
  if (members.length !== memberIds.length) {
    throw new HTTPException(400, { message: "One or more members not found" });
  }

  if (positionIds.length > 0) {
    const positions = await prisma.position.findMany({
      where: { id: { in: positionIds }, organizationId },
    });
    if (positions.length !== positionIds.length) {
      throw new HTTPException(400, {
        message: "One or more positions not found",
      });
    }
  }

  return prisma.$transaction(async (tx) => {
    await tx.memberPosition.deleteMany({
      where: { memberId: { in: memberIds } },
    });
    if (positionIds.length > 0 && memberIds.length > 0) {
      await tx.memberPosition.createMany({
        data: memberIds.flatMap((memberId) =>
          positionIds.map((positionId) => ({ memberId, positionId })),
        ),
      });
    }
  });
}
