import { prisma } from "../lib/db";

export const roleRepository = {
  findByAppId(appId: string) {
    return prisma.role.findMany({
      where: { appId },
      orderBy: { createdAt: "asc" },
    });
  },

  findById(id: string) {
    return prisma.role.findUnique({ where: { id } });
  },

  findByAppAndCode(appId: string, code: string) {
    return prisma.role.findUnique({
      where: { appId_code: { appId, code } },
    });
  },

  create(data: { appId: string; name: string; code: string }) {
    return prisma.role.create({ data });
  },

  update(id: string, data: { name?: string; code?: string }) {
    return prisma.role.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.role.delete({ where: { id } });
  },
};
