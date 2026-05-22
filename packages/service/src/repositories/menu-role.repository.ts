import { prisma } from "#lib/db";

export const menuRoleRepository = {
  findByRole(roleId: string) {
    return prisma.menuRole.findMany({
      where: { roleId },
      include: { menu: true },
    });
  },

  batchAssign(roleId: string, menuIds: string[]) {
    return prisma.$transaction([
      prisma.menuRole.deleteMany({ where: { roleId } }),
      prisma.menuRole.createMany({
        data: menuIds.map((menuId) => ({ menuId, roleId })),
      }),
    ]);
  },

  getMenusForRole(roleId: string) {
    return prisma.menu.findMany({
      where: {
        menuRoles: { some: { roleId } },
        isVisible: true,
      },
      orderBy: { sortOrder: "asc" },
    });
  },

  findAllMenus() {
    return prisma.menu.findMany({
      orderBy: { sortOrder: "asc" },
    });
  },
};
