import { HTTPException } from "hono/http-exception";
import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";
import { getOrgOwnerUserIds } from "#lib/org-role";
import {
  ORG_PERMISSION_SCOPE,
  orgScope,
  permissionWhereByScope,
  roleCodeAtScope,
} from "#lib/scope";
import { getPermissionsForRole } from "#modules/access-control/public";

export async function listPositions(organizationId: string) {
  const positions = await prisma.position.findMany({
    where: { organizationId },
    include: {
      _count: { select: { memberPositions: true } },
      role: { select: { _count: { select: { rolePermissions: true } } } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return positions.map(({ role, ...p }) => ({
    ...p,
    membersCount: p._count.memberPositions,
    permissionsCount: role?._count.rolePermissions ?? 0,
  }));
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
          user: { select: { id: true, name: true, email: true, avatar: true } },
          memberPositions: {
            include: {
              position: { select: { id: true, name: true, code: true } },
            },
          },
        },
      },
    },
  });

  const ownerUserIds = await getOrgOwnerUserIds(organizationId);

  return memberPositions.map((mp) => ({
    ...mp.member,
    role: ownerUserIds.has(mp.member.userId) ? "owner" : "member",
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

  const position = await prisma.position.create({
    data: {
      organizationId,
      name: data.name,
      code: data.code,
      description: data.description ?? null,
      sortOrder: data.sortOrder ?? 0,
    },
    include: {
      _count: { select: { memberPositions: true } },
      role: { select: { _count: { select: { rolePermissions: true } } } },
    },
  });
  return {
    ...position,
    membersCount: position._count.memberPositions,
    permissionsCount: position.role?._count.rolePermissions ?? 0,
  };
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

  return prisma.$transaction(async (tx) => {
    const updated = await tx.position.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.code !== undefined && { code: data.code }),
        ...(data.description !== undefined && {
          description: data.description,
        }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      },
      include: {
        _count: { select: { memberPositions: true } },
        role: { select: { _count: { select: { rolePermissions: true } } } },
      },
    });

    if (
      position.roleId &&
      (data.name !== undefined || data.code !== undefined)
    ) {
      try {
        await tx.role.update({
          where: { id: position.roleId },
          data: {
            ...(data.name !== undefined && { name: data.name }),
            ...(data.code !== undefined && {
              code: roleCodeAtScope(
                orgScope(organizationId),
                `position-${data.code}`,
              ),
            }),
          },
        });
      } catch (err) {
        if (
          err &&
          typeof err === "object" &&
          "code" in err &&
          err.code === "P2002"
        ) {
          throw new HTTPException(409, {
            message: "A role with this code already exists",
          });
        }
        throw err;
      }
    }

    return {
      ...updated,
      membersCount: updated._count.memberPositions,
      permissionsCount: updated.role?._count.rolePermissions ?? 0,
    };
  });
}

export async function deletePosition(organizationId: string, id: string) {
  const position = await prisma.position.findFirst({
    where: { id, organizationId },
  });
  if (!position) {
    throw new HTTPException(404, { message: "Position not found" });
  }

  await prisma.$transaction(async (tx) => {
    await tx.position.delete({ where: { id } });
    if (position.roleId) {
      await tx.role.delete({ where: { id: position.roleId } });
    }
  });

  return position;
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

  const currentMemberPositions = await prisma.memberPosition.findMany({
    where: { memberId },
    include: { position: { select: { roleId: true } } },
  });
  const oldRoleIds = currentMemberPositions
    .map((mp) => mp.position.roleId)
    .filter((r): r is string => r !== null);

  const newPositions =
    positionIds.length > 0
      ? await prisma.position.findMany({
          where: { id: { in: positionIds } },
          select: { id: true, roleId: true },
        })
      : [];
  const newRoleIds = newPositions
    .map((p) => p.roleId)
    .filter((r): r is string => r !== null);

  return prisma.$transaction(async (tx) => {
    await tx.memberPosition.deleteMany({ where: { memberId } });
    if (positionIds.length > 0) {
      await tx.memberPosition.createMany({
        data: positionIds.map((positionId) => ({ memberId, positionId })),
      });
    }

    const removedRoleIds = oldRoleIds.filter(
      (rid) => !newRoleIds.includes(rid),
    );
    const addedRoleIds = newRoleIds.filter((rid) => !oldRoleIds.includes(rid));

    for (const roleId of removedRoleIds) {
      await tx.roleAssignment.deleteMany({
        where: {
          userId: member.userId,
          roleId,
        },
      });
    }
    for (const roleId of addedRoleIds) {
      await tx.roleAssignment.upsert({
        where: {
          userId_roleId: {
            userId: member.userId,
            roleId,
          },
        },
        update: {},
        create: {
          userId: member.userId,
          roleId,
        },
      });
    }

    return tx.memberPosition.findMany({
      where: { memberId },
      include: { position: true },
    });
  });
}

export async function getAssignedPositionPermissions(
  organizationId: string,
  positionId: string,
) {
  const position = await prisma.position.findFirst({
    where: { id: positionId, organizationId },
  });
  if (!position) {
    throw new HTTPException(404, { message: "Position not found" });
  }

  return position.roleId ? await getPermissionsForRole(position.roleId) : [];
}

export interface ListAvailablePositionPermissionsParams {
  search?: string;
  sort?: "name" | "description";
  sortDir?: "asc" | "desc";
  limit: number;
  offset: number;
}

export async function listAvailablePositionPermissions(
  organizationId: string,
  positionId: string,
  params: ListAvailablePositionPermissionsParams,
) {
  const position = await prisma.position.findFirst({
    where: { id: positionId, organizationId },
  });
  if (!position) {
    throw new HTTPException(404, { message: "Position not found" });
  }

  const { search, sort, sortDir, limit, offset } = params;

  const where: Prisma.PermissionWhereInput = {
    ...permissionWhereByScope(ORG_PERMISSION_SCOPE),
  };
  if (search) {
    where.AND = [
      {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { code: { contains: search, mode: "insensitive" } },
          { group: { contains: search, mode: "insensitive" } },
        ],
      },
    ];
  }

  const orderBy: Prisma.PermissionOrderByWithRelationInput[] = sort
    ? [{ [sort]: sortDir === "desc" ? "desc" : "asc" }]
    : [{ group: "asc" }, { code: "asc" }];

  const [permissions, total] = await Promise.all([
    prisma.permission.findMany({ where, orderBy, take: limit, skip: offset }),
    prisma.permission.count({ where }),
  ]);

  return { permissions, total };
}

export async function setPositionPermissions(
  organizationId: string,
  positionId: string,
  permissionIds: string[],
) {
  const position = await prisma.position.findFirst({
    where: { id: positionId, organizationId },
  });
  if (!position) {
    throw new HTTPException(404, { message: "Position not found" });
  }

  if (permissionIds.length > 0) {
    const validPerms = await prisma.permission.findMany({
      where: {
        id: { in: permissionIds },
        ...permissionWhereByScope(ORG_PERMISSION_SCOPE),
      },
      select: { id: true },
    });
    if (validPerms.length !== permissionIds.length) {
      throw new HTTPException(400, {
        message: "One or more permissions not found",
      });
    }
  }

  let roleId = position.roleId;

  return prisma.$transaction(async (tx) => {
    if (!roleId) {
      const roleCode = roleCodeAtScope(
        orgScope(organizationId),
        `position-${position.code}`,
      );
      const existing = await tx.role.findUnique({
        where: { code: roleCode },
      });
      if (existing) {
        throw new HTTPException(409, {
          message: "A role with this code already exists in this scope",
        });
      }

      const role = await tx.role.create({
        data: {
          name: position.name,
          code: roleCode,
        },
      });
      await tx.position.update({
        where: { id: positionId },
        data: { roleId: role.id },
      });
      roleId = role.id;
    }

    const finalRoleId: string = roleId;

    await tx.rolePermission.deleteMany({ where: { roleId: finalRoleId } });
    if (permissionIds.length > 0) {
      await tx.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          permissionId,
          roleId: finalRoleId,
        })),
      });
    }

    const assigned = await tx.permission.findMany({
      where: { rolePermissions: { some: { roleId: finalRoleId } } },
    });

    return { assigned };
  });
}
