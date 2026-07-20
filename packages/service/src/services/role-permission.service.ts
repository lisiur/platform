import { HTTPException } from "hono/http-exception";
import type { Principal } from "#extractors/session";
import type { Prisma } from "#generated/prisma/client";
import type { ApiTokenPrincipal } from "#lib/api-token";
import { prisma } from "#lib/db";
import { logAudit } from "#lib/logger";
import { ADMIN_SCOPE, orgScope, scopeFromContext } from "#lib/scope";
import {
  fillAncestorGroups,
  menuPermissionsInclude,
  serializeMenu,
} from "./menu.service";

export type PermissionScope = {
  organizationId?: string | null;
  appId?: string | null;
};

function getRoleAssignmentScopeConditions(
  scope?: PermissionScope,
): Prisma.RoleAssignmentWhereInput[] {
  if (scope?.organizationId) {
    return [{ scope: orgScope(scope.organizationId) }];
  }
  return [{ scope: ADMIN_SCOPE }];
}

function getPermissionAppWhere(
  appId?: string | null,
): Prisma.PermissionWhereInput {
  if (!appId) return {};
  return { appId };
}

export async function assignPermissions(
  roleId: string,
  permissionIds: string[],
) {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    select: { appId: true },
  });
  if (!role) {
    throw new HTTPException(404, { message: "Role not found" });
  }

  if (permissionIds.length > 0) {
    const perms = await prisma.permission.findMany({
      where: { id: { in: permissionIds } },
      select: { id: true, appId: true },
    });
    if (perms.length !== permissionIds.length) {
      throw new HTTPException(400, { message: "Unknown permission id" });
    }
    for (const p of perms) {
      if (p.appId !== role.appId) {
        throw new HTTPException(400, {
          message: `Permission ${p.id} does not belong to role's app`,
        });
      }
    }
  }

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
  organizationId?: string | null;
}) {
  const role = await prisma.role.findUnique({ where: { id: params.roleId } });
  if (!role) {
    throw new HTTPException(404, { message: "Role not found" });
  }

  const scope = scopeFromContext({ organizationId: params.organizationId });
  if (role.scope !== scope) {
    throw new HTTPException(400, {
      message:
        "Role cannot be assigned under a scope that does not match its own",
    });
  }

  return prisma.roleAssignment.upsert({
    where: {
      userId_roleId_scope: {
        userId: params.userId,
        roleId: params.roleId,
        scope,
      },
    },
    update: {},
    create: {
      userId: params.userId,
      roleId: params.roleId,
      scope,
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
      OR: [
        {
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
        {
          AND: [
            { linkType: { not: "GROUP" } },
            { menuPermissions: { none: {} } },
          ],
        },
      ],
    },
    orderBy: { sortOrder: "asc" },
    include: menuPermissionsInclude,
  });
  const withAncestors = await fillAncestorGroups(menus, appId);
  return withAncestors.map(serializeMenu);
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

export async function getAllUserPermissionCodes(
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

export async function getUserPermissionCatalog(userId: string) {
  return prisma.permission.findMany({
    where: {
      rolePermissions: {
        some: {
          role: {
            roleAssignments: {
              some: { userId },
            },
          },
        },
      },
    },
    select: {
      id: true,
      code: true,
      name: true,
      group: true,
      description: true,
    },
    orderBy: [{ group: "asc" }, { name: "asc" }],
  });
}

function matchSinglePermission(pattern: string, permission: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith("::*")) {
    const scope = pattern.slice(0, -3);
    return permission === pattern || permission.startsWith(`${scope}::`);
  }
  return pattern === permission;
}

export function matchPermission(
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
    await auditPermissionDenied(permission, scope, "user_lacks_permission");
    throw new HTTPException(403, { message: "Permission denied" });
  }
}

async function enforceTokenBinding(
  principal: { kind: "token" } & ApiTokenPrincipal,
  permission: string,
  scope?: PermissionScope,
) {
  const token = principal.token;
  if (token.organizationId && token.organizationId !== scope?.organizationId) {
    await auditPermissionDenied(permission, scope, "org_binding_mismatch");
    throw new HTTPException(403, { message: "Permission denied" });
  }
  if (token.appId && token.appId !== scope?.appId) {
    await auditPermissionDenied(permission, scope, "app_binding_mismatch");
    throw new HTTPException(403, { message: "Permission denied" });
  }
}

export async function assertAccess(
  principal: Principal,
  permission: string,
  scope?: PermissionScope,
) {
  if (principal.kind === "user") {
    return assertPermission(principal.user.id, permission, scope);
  }

  await enforceTokenBinding(principal, permission, scope);

  if (!matchPermission(principal.scopes, permission)) {
    await auditPermissionDenied(permission, scope, "token_lacks_scope");
    throw new HTTPException(403, { message: "Permission denied" });
  }

  if (!(await checkPermission(principal.ownerId, permission, scope))) {
    await auditPermissionDenied(permission, scope, "owner_lacks_permission");
    throw new HTTPException(403, { message: "Permission denied" });
  }
}

async function auditPermissionDenied(
  permission: string,
  scope: PermissionScope | undefined,
  reason: string,
) {
  await logAudit({
    event: "permission.denied",
    category: "permission",
    outcome: "denied",
    severity: "warning",
    metadata: { permission, scope, reason },
  });
}
