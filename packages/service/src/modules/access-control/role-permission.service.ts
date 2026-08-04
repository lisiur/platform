import { HTTPException } from "hono/http-exception";
import type { Principal } from "#extractors/session";
import { prisma } from "#lib/db";
import { throwPermissionDenied } from "#lib/http-error";
import { logAudit } from "#lib/logger";
import {
  permissionScopeForRoleCode,
  permissionWhereByScope,
  roleAssignmentWhereByRoleScope,
  SYSTEM_SCOPE,
} from "#lib/scope";
import {
  fillAncestorGroups,
  menuPermissionsInclude,
  serializeMenu,
} from "#modules/application/public";

export async function assignPermissions(
  roleId: string,
  permissionIds: string[],
) {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    select: { id: true, code: true },
  });
  if (!role) {
    throw new HTTPException(404, { message: "Role not found" });
  }

  if (permissionIds.length > 0) {
    const scope = permissionScopeForRoleCode(role.code);
    const perms = await prisma.permission.findMany({
      where: { id: { in: permissionIds }, ...permissionWhereByScope(scope) },
      select: { id: true },
    });
    if (perms.length !== new Set(permissionIds).size) {
      throw new HTTPException(400, {
        message: "One or more permissions not found or out of scope",
      });
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

export async function assignRole(params: { userId: string; roleId: string }) {
  const role = await prisma.role.findUnique({ where: { id: params.roleId } });
  if (!role) {
    throw new HTTPException(404, { message: "Role not found" });
  }

  return prisma.roleAssignment.upsert({
    where: {
      userId_roleId: { userId: params.userId, roleId: params.roleId },
    },
    update: {},
    create: { userId: params.userId, roleId: params.roleId },
  });
}

/**
 * Returns the menu tree visible to the user within an app at a given scope.
 * Two-step: resolve the user's permission codes at the scope, then surface
 * menus whose required permission the user holds (or that need none).
 */
export async function getMenusForUser(
  userId: string,
  appId: string,
  scope: string = SYSTEM_SCOPE,
) {
  const userPermCodes = await getUserPermissions(userId, scope);

  const menus = await prisma.menu.findMany({
    where: {
      appId,
      OR: [
        {
          menuPermissions: {
            some: { permission: { code: { in: userPermCodes } } },
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

/**
 * Returns the permission codes granted to the user at a given scope.
 * Scope matching is exact: a role's scope segment (the part of its code before
 * the last `/`) must equal `scope`. No inheritance, no wildcards.
 */
export async function getUserPermissions(
  userId: string,
  scope: string = SYSTEM_SCOPE,
): Promise<string[]> {
  const assignments = await prisma.roleAssignment.findMany({
    where: { userId, ...roleAssignmentWhereByRoleScope(scope) },
    include: {
      role: {
        include: {
          rolePermissions: {
            include: { permission: { select: { code: true } } },
          },
        },
      },
    },
  });

  const codes = new Set<string>();
  for (const assignment of assignments) {
    for (const rp of assignment.role.rolePermissions) {
      codes.add(rp.permission.code);
    }
  }
  return [...codes];
}

/** Alias kept for callers that read better with the catalog framing. */
export async function getAllUserPermissionCodes(
  userId: string,
  scope: string = SYSTEM_SCOPE,
): Promise<string[]> {
  return getUserPermissions(userId, scope);
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
  if (pattern.endsWith(":*")) {
    const prefix = pattern.slice(0, -2);
    return permission.startsWith(`${prefix}:`);
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
  scope: string = SYSTEM_SCOPE,
): Promise<boolean> {
  const userPermissions = await getUserPermissions(userId, scope);
  return matchPermission(userPermissions, permission);
}

export async function assertPermission(
  userId: string,
  permission: string,
  scope: string = SYSTEM_SCOPE,
) {
  const allowed = await checkPermission(userId, permission, scope);
  if (!allowed) {
    await auditPermissionDenied(permission, scope, "user_lacks_permission");
    throwPermissionDenied(permission, "user_lacks_permission");
  }
}

async function enforceTokenBinding(
  token: { scope?: string | null },
  permission: string,
  scope: string,
) {
  if (token.scope && token.scope !== scope) {
    await auditPermissionDenied(permission, scope, "token_scope_mismatch");
    throwPermissionDenied(permission, "token_scope_mismatch");
  }
}

export async function assertAccess(
  principal: Principal,
  permission: string,
  scope: string = SYSTEM_SCOPE,
) {
  if (principal.kind === "user") {
    return assertPermission(principal.user.id, permission, scope);
  }

  await enforceTokenBinding(principal.token, permission, scope);

  if (!matchPermission(principal.scopes, permission)) {
    await auditPermissionDenied(permission, scope, "token_lacks_scope");
    throwPermissionDenied(permission, "token_lacks_scope");
  }

  if (!(await checkPermission(principal.ownerId, permission, scope))) {
    await auditPermissionDenied(permission, scope, "owner_lacks_permission");
    throwPermissionDenied(permission, "owner_lacks_permission");
  }
}

async function auditPermissionDenied(
  permission: string,
  scope: string,
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
