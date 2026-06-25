import { HTTPException } from "hono/http-exception";
import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";
import { menuPermissionsInclude, serializeMenu } from "./menu.service";

const PLATFORM_SCOPE_ID = "";

type RoleScopeType = "PLATFORM" | "ORGANIZATION" | "APPLICATION";

export type PermissionScope = {
  organizationId?: string | null;
  appId?: string | null;
};

function toScopeId(scopeId?: string | null) {
  return scopeId ?? PLATFORM_SCOPE_ID;
}

function getRoleAssignmentScopeConditions(
  scope?: PermissionScope,
): Prisma.RoleAssignmentWhereInput[] {
  const conditions: Prisma.RoleAssignmentWhereInput[] = [
    { scopeType: "PLATFORM", scopeId: PLATFORM_SCOPE_ID },
  ];

  if (scope?.organizationId) {
    conditions.push({
      scopeType: "ORGANIZATION",
      scopeId: scope.organizationId,
    });
  }

  if (scope?.appId) {
    conditions.push({ scopeType: "APPLICATION", scopeId: scope.appId });
  }

  return conditions;
}

function getPermissionAppWhere(
  appId?: string | null,
): Pick<Prisma.PermissionWhereInput, "OR" | "appId"> {
  if (!appId) return { appId: null };
  return { OR: [{ appId: null }, { appId }] };
}

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

export async function assignRole(params: {
  userId: string;
  roleId: string;
  scopeType: RoleScopeType;
  scopeId?: string | null;
}) {
  const role = await prisma.role.findUnique({ where: { id: params.roleId } });
  if (!role) {
    throw new HTTPException(404, { message: "Role not found" });
  }

  const scopeId = toScopeId(params.scopeId);
  if (
    role.scopeType === "ORGANIZATION" &&
    (params.scopeType !== "ORGANIZATION" || scopeId !== role.scopeId)
  ) {
    throw new HTTPException(400, {
      message:
        "Organization-specific role can only be assigned in its organization",
    });
  }

  return prisma.roleAssignment.upsert({
    where: {
      userId_roleId_scopeType_scopeId: {
        userId: params.userId,
        roleId: params.roleId,
        scopeType: params.scopeType,
        scopeId,
      },
    },
    update: {},
    create: {
      userId: params.userId,
      roleId: params.roleId,
      scopeType: params.scopeType,
      scopeId,
    },
  });
}

export async function getMenusForUser(
  userId: string,
  appId: string,
  scope?: PermissionScope,
) {
  const menus = await prisma.menu.findMany({
    where: {
      appId,
      menuPermissions: {
        some: {
          permission: {
            rolePermissions: {
              some: {
                role: {
                  roleAssignments: {
                    some: {
                      userId,
                      OR: getRoleAssignmentScopeConditions(scope),
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { sortOrder: "asc" },
    include: menuPermissionsInclude,
  });
  return menus.map(serializeMenu);
}

export async function getUserPermissions(
  userId: string,
  scope?: PermissionScope,
): Promise<string[]> {
  const permissions = await prisma.permission.findMany({
    where: {
      ...getPermissionAppWhere(scope?.appId),
      rolePermissions: {
        some: {
          role: {
            roleAssignments: {
              some: {
                userId,
                OR: getRoleAssignmentScopeConditions(scope),
              },
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
  scope?: PermissionScope,
): Promise<boolean> {
  const userPermissions = await getUserPermissions(userId, scope);
  return matchPermission(userPermissions, permission);
}

export async function assertPermission(
  userId: string,
  permission: string,
  scope?: PermissionScope,
) {
  const allowed = await checkPermission(userId, permission, scope);
  if (!allowed) {
    throw new HTTPException(403, { message: "Permission denied" });
  }
}
