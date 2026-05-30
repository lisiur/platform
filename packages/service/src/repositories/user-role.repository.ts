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
    // Get user's role for mapping
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user) {
      return [];
    }

    // Union of:
    // 1. Explicit custom roles via UserRole
    // 2. Mapped roles where Role.authRole === User.role (from any app)
    const menus = await prisma.menu.findMany({
      where: {
        menuRoles: {
          some: {
            role: {
              OR: [
                // Explicit custom role assignments
                {
                  userRoles: {
                    some: { userId },
                  },
                },
                // Mapped roles based on auth role
                ...(user.role
                  ? [
                      {
                        authRole: user.role,
                      },
                    ]
                  : []),
              ],
            },
          },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    return menus;
  },
};
