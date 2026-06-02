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
    const menus = await prisma.menu.findMany({
      where: {
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
  },
};
