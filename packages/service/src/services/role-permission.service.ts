import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";

export async function assignPermissions(
  roleId: string,
  permissionIds: string[],
) {
  return prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ permissionId, roleId })),
    }),
  ]);
}

export function getPermissionsForRole(roleId: string) {
  return prisma.permission.findMany({
    where: {
      rolePermissions: { some: { roleId } },
    },
  });
}

export function getPermissionCodesForRole(roleId: string) {
  return prisma.rolePermission.findMany({
    where: { roleId },
    include: { permission: { select: { code: true } } },
  });
}

export async function getMenusForRole(roleId: string) {
  return prisma.menu.findMany({
    where: {
      permission: {
        rolePermissions: { some: { roleId } },
      },
    },
    orderBy: { sortOrder: "asc" },
  });
}

export { getMenusForRole as getRoleMenus };

export async function assignPermissionByMenuIds(
  roleId: string,
  menuIds: string[],
) {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) {
    throw new HTTPException(404, { message: "Role not found" });
  }

  const menus = await prisma.menu.findMany({
    where: { id: { in: menuIds }, appId: role.appId },
    select: { id: true, permissionId: true },
  });

  const validMenuIds = new Set(menus.map((m) => m.id));
  for (const menuId of menuIds) {
    if (!validMenuIds.has(menuId)) {
      throw new HTTPException(400, {
        message: "One or more menus do not belong to the role's application",
      });
    }
  }

  const permissionIds = menus.map((m) => m.permissionId);

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ permissionId, roleId })),
    }),
  ]);

  return prisma.menu.findMany({
    where: {
      permission: {
        rolePermissions: { some: { roleId } },
      },
    },
    orderBy: { sortOrder: "asc" },
  });
}

export async function getMenusForUser(userId: string, appId: string) {
  const menus = await prisma.menu.findMany({
    where: {
      appId,
      permission: {
        rolePermissions: {
          some: {
            role: {
              userRoles: {
                some: { userId },
              },
            },
          },
        },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  return menus;
}

export async function getUserPermissions(userId: string): Promise<string[]> {
  const permissions = await prisma.permission.findMany({
    where: {
      rolePermissions: {
        some: {
          role: {
            userRoles: {
              some: { userId },
            },
          },
        },
      },
    },
    select: { code: true },
  });

  return permissions.map((p) => p.code);
}

function matchSinglePermission(pattern: string, permission: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith("::*")) {
    const scope = pattern.slice(0, -3);
    return permission === pattern || permission.startsWith(`${scope}::`);
  }
  return pattern === permission;
}

function matchPermission(
  userPermissions: string[],
  requiredPermission: string,
): boolean {
  const negations: string[] = [];
  const positives: string[] = [];

  for (const perm of userPermissions) {
    if (perm.startsWith("!")) {
      negations.push(perm.slice(1));
    } else {
      positives.push(perm);
    }
  }

  for (const neg of negations) {
    if (matchSinglePermission(neg, requiredPermission)) {
      return false;
    }
  }

  for (const pos of positives) {
    if (matchSinglePermission(pos, requiredPermission)) {
      return true;
    }
  }

  return false;
}

export async function checkPermission(
  userId: string,
  permission: string,
): Promise<boolean> {
  const userPermissions = await getUserPermissions(userId);
  return matchPermission(userPermissions, permission);
}
