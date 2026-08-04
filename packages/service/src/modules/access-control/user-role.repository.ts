import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";

export const userRoleRepository = {
  findByUser(userId: string) {
    return prisma.roleAssignment.findMany({
      where: { userId },
      include: { role: true },
    });
  },

  findByUserAndRole(userId: string, roleId: string) {
    return prisma.roleAssignment.findUnique({
      where: {
        userId_roleId: { userId, roleId },
      },
    });
  },

  async assign(userId: string, roleId: string) {
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new HTTPException(404, { message: "Role not found" });
    }

    return prisma.roleAssignment.upsert({
      where: {
        userId_roleId: { userId, roleId },
      },
      update: {},
      create: { userId, roleId },
      include: { role: true },
    });
  },

  remove(userId: string, roleId: string) {
    return prisma.roleAssignment.deleteMany({
      where: { userId, roleId },
    });
  },
};
