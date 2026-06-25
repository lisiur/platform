import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import { menuPermissionsInclude, serializeMenu } from "#services/menu.service";

type RoleScopeType = "PLATFORM" | "ORGANIZATION" | "APPLICATION";

const PLATFORM_SCOPE_ID = "";

function scopeIdOrDefault(scopeId?: string | null) {
  return scopeId ?? PLATFORM_SCOPE_ID;
}

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
          scopeType: "PLATFORM",
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
    const scopeType = scope?.scopeType ?? "PLATFORM";
    const scopeId = scopeIdOrDefault(scope?.scopeId);

    if (!role) {
      throw new HTTPException(404, { message: "Role not found" });
    }

    if (
      role.scopeType === "ORGANIZATION" &&
      (scopeType !== "ORGANIZATION" || scopeId !== role.scopeId)
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
    const scopeType = scope?.scopeType ?? "PLATFORM";
    const scopeId = scopeIdOrDefault(scope?.scopeId);
    return prisma.roleAssignment.deleteMany({
      where: { userId, roleId, scopeType, scopeId },
    });
  },

  async getMenusForUser(userId: string) {
    const menus = await prisma.menu.findMany({
      where: {
        menuPermissions: {
          some: {
            permission: {
              rolePermissions: {
                some: {
                  role: {
                    roleAssignments: {
                      some: { userId, scopeType: "PLATFORM", scopeId: "" },
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
  },
};
