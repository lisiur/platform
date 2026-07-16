import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import {
  PLATFORM_SCOPE_ID,
  RoleScopeType,
  scopeIdOrDefault,
} from "#lib/role-scope";
import {
  fillAncestorGroups,
  menuPermissionsInclude,
  serializeMenu,
} from "#services/menu.service";

export const userRoleRepository = {
  findByUser(
    userId: string,
    scope?: { scopeType?: RoleScopeType; scopeId?: string | null },
  ) {
    return prisma.roleAssignment.findMany({
      where: {
        userId,
        ...(scope?.scopeType
          ? {
              scopeType: scope.scopeType,
              scopeId: scopeIdOrDefault(scope.scopeId),
            }
          : {}),
      },
      include: { role: true },
    });
  },

  findByUserAndRole(userId: string, roleId: string) {
    return prisma.roleAssignment.findUnique({
      where: {
        userId_roleId_scopeType_scopeId: {
          userId,
          roleId,
          scopeType: RoleScopeType.PLATFORM,
          scopeId: PLATFORM_SCOPE_ID,
        },
      },
    });
  },

  async assign(
    userId: string,
    roleId: string,
    scope?: { scopeType?: RoleScopeType; scopeId?: string | null },
  ) {
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    const scopeType = scope?.scopeType ?? RoleScopeType.PLATFORM;
    const scopeId = scopeIdOrDefault(scope?.scopeId);

    if (!role) {
      throw new HTTPException(404, { message: "Role not found" });
    }

    if (
      role.scopeType === RoleScopeType.ORGANIZATION &&
      (scopeType !== RoleScopeType.ORGANIZATION || scopeId !== role.scopeId)
    ) {
      throw new HTTPException(400, {
        message:
          "Organization-specific role can only be assigned in its organization",
      });
    }

    return prisma.$transaction(async (tx) => {
      return tx.roleAssignment.upsert({
        where: {
          userId_roleId_scopeType_scopeId: {
            userId,
            roleId,
            scopeType,
            scopeId,
          },
        },
        update: {},
        create: { userId, roleId, scopeType, scopeId },
        include: { role: true },
      });
    });
  },

  remove(
    userId: string,
    roleId: string,
    scope?: { scopeType?: RoleScopeType; scopeId?: string | null },
  ) {
    const scopeType = scope?.scopeType ?? RoleScopeType.PLATFORM;
    const scopeId = scopeIdOrDefault(scope?.scopeId);
    return prisma.roleAssignment.deleteMany({
      where: { userId, roleId, scopeType, scopeId },
    });
  },

  async getMenusForUser(userId: string) {
    const menus = await prisma.menu.findMany({
      where: {
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
                            scopeType: RoleScopeType.PLATFORM,
                            scopeId: PLATFORM_SCOPE_ID,
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

    const withAncestors = await fillAncestorGroups(menus);
    return withAncestors.map(serializeMenu);
  },
};
