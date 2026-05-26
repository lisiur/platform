import { prisma } from "#lib/db";

export const userRoleRepository = {
  findByUser(userId: string) {
    return prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });
  },

  findByUserAndRole(userId: string, roleId: string) {
    return prisma.userRole.findUnique({
      where: { userId_roleId: { userId, roleId } },
    });
  },

  assign(userId: string, roleId: string) {
    return prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      update: {},
      create: { userId, roleId },
      include: { role: true },
    });
  },

  remove(userId: string, roleId: string) {
    return prisma.userRole.deleteMany({
      where: { userId, roleId },
    });
  },

  async getMenusForUser(userId: string) {
    // First try app-scoped roles via UserRole
    const scopedMenus = await prisma.menu.findMany({
      where: {
        menuRoles: {
          some: {
            role: {
              userRoles: { some: { userId } },
            },
          },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    if (scopedMenus.length > 0) {
      return scopedMenus;
    }

    // Fallback: check global User.role (for users without UserRole records)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user?.role) {
      return [];
    }

    // For global admin role, return all menus
    // For other global roles, find roles with matching code across all apps
    return prisma.menu.findMany({
      where: {
        menuRoles: {
          some: {
            role: {
              code: user.role,
            },
          },
        },
      },
      orderBy: { sortOrder: "asc" },
    });
  },
};
